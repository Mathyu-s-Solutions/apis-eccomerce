import { AFFECTATIONS, DETRACTIONS, DOCUMENT_CODES, LEGENDS } from '../core/catalogs';
import { amountInWords } from '../core/amount-in-words';
import { type Dec, ZERO, abs, add, cmp, dec, div, fmt, isZero, mul, round, sub } from '../core/decimal';
import { oneLine } from '../core/xml';
import type { SaleDocumentDto } from '../dto/document.dto';
import { SunatInputError } from '../errors';
import type { Allowance, Installment, Issuer, Line, SaleDocument, Totals } from './model';

const HUNDRED = dec(100);
const CENT = dec('0.01');

const r2 = (x: Dec) => round(x, 2);
const factorOf = (amount: Dec, base: Dec): Dec => (isZero(base) ? ZERO : round(div(amount, base), 5));
const sum = (xs: Dec[]) => add(ZERO, ...xs);

function buildLine(item: SaleDocumentDto['items'][number], index: number): Line {
  const affectation = AFFECTATIONS[item.codigo_tipo_afectacion_igv];
  const quantity = dec(item.cantidad);
  const taxed = affectation.kind === 'gravado' || affectation.kind === 'ivap';
  const igvPercent = taxed ? dec(item.porcentaje_igv) : ZERO;
  const rate = div(igvPercent, HUNDRED);
  // Sin valor_unitario, sale del precio_unitario (con IGV): precio / (1 + tasa), con los 10 decimales.
  const price = item.valor_unitario === undefined && item.precio_unitario !== undefined ? dec(item.precio_unitario) : null;
  const unitValue = price === null ? dec(item.valor_unitario ?? '0') : taxed ? div(price, add(dec(1), rate)) : price;
  const gross = mul(quantity, unitValue);

  const discounts: Allowance[] = [];
  let affecting = ZERO;
  let notAffecting = ZERO;
  for (const d of item.descuentos ?? []) {
    const amount = dec(d.monto);
    if (isZero(amount)) continue;
    if (affectation.free) throw new SunatInputError(`Ítem ${index}: una operación gratuita no lleva descuentos.`);
    const base = r2(gross);
    if (cmp(amount, base) > 0) throw new SunatInputError(`Ítem ${index}: el descuento (${fmt(amount)}) es mayor que el valor del ítem (${fmt(base)}).`);
    discounts.push({ code: d.codigo, amount, base, factor: factorOf(amount, base) });
    if (d.codigo === '00') affecting = add(affecting, amount);
    else notAffecting = add(notAffecting, amount);
  }

  // El IGV sale de la base sin redondear: 2 × 254.237288 da 600.00 y no 599.99.
  const base = sub(gross, affecting);
  let value = r2(base);
  let igv = r2(mul(base, rate));
  // Con el precio (y sin descuentos), el ítem cuesta exacto precio × cantidad: el valor se redondea y el IGV es la
  // diferencia. Redondeando los dos por separado, a veces la suma se pasa un céntimo del precio de la etiqueta.
  // La diferencia con base × tasa queda dentro de la tolerancia de SUNAT (±1).
  if (price !== null && taxed && !affectation.free && discounts.length === 0) {
    const total = r2(mul(quantity, price));
    value = r2(div(total, add(dec(1), rate)));
    igv = sub(total, value);
  }
  // Precio unitario: lo que paga el cliente por unidad (valor + IGV - descuentos que no afectan la base).
  const unitPrice = affectation.free
    ? unitValue
    : isZero(quantity)
      ? mul(unitValue, add(dec(1), rate))
      : div(sub(mul(base, add(dec(1), rate)), notAffecting), quantity);

  return {
    index,
    unit: item.unidad_de_medida.toUpperCase(),
    code: item.codigo_interno || null,
    sunatCode: item.codigo_producto_sunat || null,
    description: oneLine(item.descripcion),
    quantity,
    affectationCode: item.codigo_tipo_afectacion_igv,
    affectation,
    igvPercent,
    unitValue: affectation.free ? ZERO : unitValue,
    unitPrice,
    value,
    igv,
    total: affectation.free ? ZERO : sub(add(value, igv), notAffecting),
    discounts,
    plate: item.vehiculo_automotor?.numero_de_placa.toUpperCase().replace(/-/g, '') ?? null,
  };
}

/** Reparte un descuento global que afecta la base: primero a las gravadas y el resto a las demás. */
function spreadOverBases(amount: Dec, bases: { gravadas: Dec; exoneradas: Dec; inafectas: Dec; exportacion: Dec; ivap: Dec }) {
  const toGravadas = cmp(amount, bases.gravadas) > 0 ? bases.gravadas : amount;
  let rest = sub(amount, toGravadas);
  bases.gravadas = sub(bases.gravadas, toGravadas);
  for (const k of ['ivap', 'exoneradas', 'inafectas', 'exportacion'] as const) {
    if (isZero(rest)) break;
    const take = cmp(rest, bases[k]) > 0 ? bases[k] : rest;
    bases[k] = sub(bases[k], take);
    rest = sub(rest, take);
  }
  return toGravadas;
}

export interface BuildOptions {
  number: number;
  /** Fecha y hora de emisión por defecto (hora de Lima). */
  today: string;
  now: string;
}

/**
 * Convierte el pedido del cliente en el comprobante ya calculado: valores por
 * ítem, bases por tipo de operación, IGV y total, con las reglas del UBL 2.1.
 */
export function buildSaleDocument(dto: SaleDocumentDto, issuer: Issuer, opts: BuildOptions): SaleDocument {
  const type = DOCUMENT_CODES[dto.documento] as SaleDocument['type'];
  const lines = dto.items.map((item, i) => buildLine(item, i + 1));
  const onerous = lines.filter((l) => !l.affectation.free);
  const free = lines.filter((l) => l.affectation.free);
  const byKind = (kind: string) => sum(onerous.filter((l) => l.affectation.kind === kind).map((l) => l.value));

  const rates = [...new Set(onerous.filter((l) => l.affectation.kind === 'gravado').map((l) => fmt(l.igvPercent, 2)))];
  if (rates.length > 1) throw new SunatInputError(`Un comprobante lleva una sola tasa de IGV; los ítems traen ${rates.join(' y ')}.`);
  const igvPercent = rates.length ? dec(rates[0]) : dec(18);
  const rate = div(igvPercent, HUNDRED);
  const ivapLines = onerous.filter((l) => l.affectation.kind === 'ivap');
  const ivapRate = ivapLines.length ? div(ivapLines[0].igvPercent, HUNDRED) : ZERO;

  const lineValue = sum(onerous.map((l) => l.value));
  const bases = {
    gravadas: byKind('gravado'),
    exoneradas: byKind('exonerado'),
    inafectas: byKind('inafecto'),
    exportacion: byKind('exportacion'),
    ivap: byKind('ivap'),
  };
  const gravadasBefore = bases.gravadas;
  let gravadasAfterDiscounts = bases.gravadas; // después de los descuentos 02, antes de anticipos

  const allowances: Allowance[] = [];
  let globalAffecting = ZERO; // código 02
  let globalNotAffecting = ZERO; // código 03
  let retentionAmount = ZERO; // código 62
  const pendingNotAffecting: Dec[] = []; // su base es el precio de venta, que aún no se conoce
  for (const d of dto.descuentos ?? []) {
    const amount = dec(d.monto);
    if (isZero(amount)) continue;
    if (d.codigo === '02') {
      if (cmp(amount, lineValue) > 0) throw new SunatInputError(`El descuento global (${fmt(amount)}) es mayor que el valor de venta (${fmt(lineValue)}).`);
      allowances.push({ code: '02', amount, base: lineValue, factor: factorOf(amount, lineValue) });
      globalAffecting = add(globalAffecting, amount);
      spreadOverBases(amount, bases);
      gravadasAfterDiscounts = bases.gravadas;
    } else if (d.codigo === '03') {
      globalNotAffecting = add(globalNotAffecting, amount);
      pendingNotAffecting.push(amount);
    } else {
      retentionAmount = add(retentionAmount, amount);
    }
  }

  // Anticipos: `monto` es el total del comprobante de anticipo (con IGV).
  const prepayments = (dto.anticipos ?? []).map((a) => ({
    docType: a.documento === 'factura' ? '02' : '03', // catálogo 12
    id: `${a.serie}-${a.numero}`,
    amount: dec(a.monto),
  }));
  const prepaid = sum(prepayments.map((p) => p.amount));
  let prepaidBase = ZERO;
  if (!isZero(prepaid)) {
    const gravado = !isZero(bases.gravadas);
    prepaidBase = gravado ? r2(div(prepaid, add(dec(1), rate))) : prepaid;
    const code = gravado ? '04' : !isZero(bases.exoneradas) ? '05' : '06';
    const base = gravado ? bases.gravadas : add(bases.exoneradas, bases.inafectas);
    if (cmp(prepaidBase, base) > 0) throw new SunatInputError(`Los anticipos (${fmt(prepaid)}) superan el monto del comprobante.`);
    allowances.push({ code, amount: prepaidBase, base, factor: factorOf(prepaidBase, base) });
    spreadOverBases(prepaidBase, bases);
  }

  // Con ajustes a la base, el IGV se recalcula sobre la base final; si no, es la suma de los ítems.
  const lineIgv = sum(onerous.filter((l) => l.affectation.kind === 'gravado').map((l) => l.igv));
  const igvOn = (base: Dec) => (cmp(base, gravadasBefore) === 0 ? lineIgv : r2(mul(base, rate)));
  const igv = igvOn(bases.gravadas);
  // IGV del total de la venta, sin restar los anticipos (para el precio de venta).
  const igvBeforePrepaid = igvOn(gravadasAfterDiscounts);
  const igvIvap = sum(ivapLines.map((l) => l.igv));
  const itemNotAffecting = sum(lines.flatMap((l) => l.discounts.filter((d) => d.code === '01').map((d) => d.amount)));

  const taxes = add(igv, igvIvap);
  // Los anticipos no bajan el valor ni el precio de venta: se restan al final (PrepaidAmount).
  const value = sub(lineValue, globalAffecting);
  const priceWithTaxes = add(value, igvBeforePrepaid, igvIvap);
  const discounts = add(globalNotAffecting, itemNotAffecting);
  for (const amount of pendingNotAffecting) {
    if (cmp(amount, priceWithTaxes) > 0) throw new SunatInputError(`El descuento global (${fmt(amount)}) es mayor que el total (${fmt(priceWithTaxes)}).`);
    allowances.push({ code: '03', amount, base: priceWithTaxes, factor: factorOf(amount, priceWithTaxes) });
  }
  const payable = sub(sub(priceWithTaxes, discounts), prepaid);
  if (cmp(payable, ZERO) < 0) throw new SunatInputError('Los descuentos y anticipos superan el total del comprobante.');

  const totals: Totals = {
    ...bases,
    gratuitas: sum(free.map((l) => l.value)),
    igvGratuitas: sum(free.map((l) => l.igv)),
    igv,
    igvIvap,
    taxes,
    value,
    priceWithTaxes,
    discounts,
    prepaid,
    payable,
  };

  if (dto.total != null) {
    const given = dec(dto.total);
    if (cmp(abs(sub(given, payable)), CENT) > 0) {
      throw new SunatInputError(`El total enviado (${fmt(given)}) no coincide con el calculado (${fmt(payable)}). Revisa valor_unitario (o precio_unitario), cantidad y descuentos.`, {
        total_calculado: fmt(payable),
        total_gravada: fmt(totals.gravadas),
        total_exonerada: fmt(totals.exoneradas),
        total_inafecta: fmt(totals.inafectas),
        total_exportacion: fmt(totals.exportacion),
        total_gratuita: fmt(totals.gratuitas),
        total_igv: fmt(totals.igv),
        total_descuentos: fmt(totals.discounts),
        total_anticipos: fmt(totals.prepaid),
      });
    }
  }

  let retention: SaleDocument['retention'];
  if (!isZero(retentionAmount)) {
    if (cmp(retentionAmount, payable) > 0) throw new SunatInputError('La retención no puede ser mayor que el total.');
    allowances.push({ code: '62', amount: retentionAmount, base: payable, factor: factorOf(retentionAmount, payable) });
    retention = { amount: retentionAmount, percent: mul(factorOf(retentionAmount, payable), HUNDRED) };
  }

  let detraction: SaleDocument['detraction'];
  if (dto.detraccion) {
    const d = dto.detraccion;
    if (!(d.detraccion_tipo in DETRACTIONS)) throw new SunatInputError(`detraccion_tipo ${d.detraccion_tipo} no es un código del catálogo 54.`);
    detraction = { code: d.detraccion_tipo, percent: dec(d.detraccion_porcentaje), amount: dec(d.detraccion_total), paymentMeans: d.medio_de_pago, account: d.numero_cuenta_banco_nacion };
  }

  const installments: Installment[] = (dto.cuotas ?? []).map((c) => ({ amount: dec(c.importe), dueDate: c.fecha_de_pago }));
  let payment: SaleDocument['payment'];
  if (installments.length) {
    const pending = sum(installments.map((c) => c.amount));
    const isDateFix = type === '07' && dto.nota_credito_codigo_tipo === '13';
    if (!isDateFix && cmp(pending, payable) > 0) throw new SunatInputError(`Las cuotas suman ${fmt(pending)}, más que el total (${fmt(payable)}). El importe de las cuotas es lo que queda por cobrar (sin detracción ni retención).`);
    payment = { type: 'Credito', pending, installments };
  } else if (type === '01') {
    payment = { type: 'Contado', installments: [] };
  }

  const legends: SaleDocument['legends'] = [{ code: LEGENDS.amountInWords, value: amountInWords(fmt(payable), dto.moneda) }];
  if (free.length) legends.push({ code: LEGENDS.freeTransfer, value: 'TRANSFERENCIA GRATUITA DE UN BIEN Y/O SERVICIO PRESTADO GRATUITAMENTE' });
  if (detraction) legends.push({ code: LEGENDS.detraction, value: 'Operación sujeta a detracción' });

  let note: SaleDocument['note'];
  if (type === '07' || type === '08') {
    const affected = dto.documento_afectado!;
    note = {
      code: (type === '07' ? dto.nota_credito_codigo_tipo : dto.nota_debito_codigo_tipo)!,
      reason: oneLine((type === '07' ? dto.nota_credito_motivo : dto.nota_debito_motivo)!),
      affectedType: DOCUMENT_CODES[affected.documento] as '01' | '03',
      affectedId: `${affected.serie}-${affected.numero}`,
    };
  }

  return {
    type,
    series: dto.serie,
    number: dto.numero ?? opts.number,
    issueDate: dto.fecha_de_emision ?? opts.today,
    issueTime: normalizeTime(dto.hora_de_emision) ?? opts.now,
    dueDate: dto.fecha_de_vencimiento ?? installments.at(-1)?.dueDate ?? null,
    currency: dto.moneda,
    operationType: dto.tipo_operacion,
    purchaseOrder: dto.orden_compra_servicio || null,
    observation: dto.observacion ? oneLine(dto.observacion) : null,
    issuer: {
      ...issuer,
      codigoAnexo: dto.emisor_codigo_de_anexo ?? issuer.codigoAnexo,
      direccion: dto.emisor_direccion || issuer.direccion,
    },
    customer: {
      docType: dto.cliente_tipo_de_documento,
      docNumber: dto.cliente_numero_de_documento,
      name: oneLine(dto.cliente_denominacion),
      address: dto.cliente_direccion ? oneLine(dto.cliente_direccion) : null,
    },
    lines,
    allowances,
    totals,
    igvPercent,
    payment,
    detraction,
    retention,
    prepayments,
    note,
    legends,
  };
}

function normalizeTime(time?: string | null): string | null {
  if (!time) return null;
  return time.length === 5 ? `${time}:00` : time;
}
