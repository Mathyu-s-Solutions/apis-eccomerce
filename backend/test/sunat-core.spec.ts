import { gzipSync } from 'node:zlib';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { describe, expect, it } from 'vitest';
import { amountInWords } from '../src/modules/sunat/core/amount-in-words';
import { abs, add, cmp, dec, div, fmt, fmtTrim, mul, round, sub } from '../src/modules/sunat/core/decimal';
import { isValidRuc, rucFromDni } from '../src/modules/sunat/core/ruc';
import { ubigeoNames } from '../src/modules/sunat/core/ubigeos';
import { esc } from '../src/modules/sunat/core/xml';
import type { BlobSource } from '../src/modules/sunat/consultas/blob-source';
import { PadronReader } from '../src/modules/sunat/consultas/padron.reader';
import { CarrierDespatchSchema, DespatchSchema } from '../src/modules/sunat/dto/despatch.dto';
import { SaleDocumentSchema } from '../src/modules/sunat/dto/document.dto';
import { DailySummarySchema, VoidedSchema } from '../src/modules/sunat/dto/operations.dto';
import { SunatInputError } from '../src/modules/sunat/errors';
import { certificateBody, certificateInfo, parseCertificate } from '../src/modules/sunat/signing/certificate';
import { testCertificate } from '../src/modules/sunat/signing/test-certificate';
import { signXml } from '../src/modules/sunat/signing/xml-signer';
import { BETA_SOL, BillServiceClient, SunatFault, SunatUnavailable } from '../src/modules/sunat/transport/bill-service';
import { parseCdrXml } from '../src/modules/sunat/transport/cdr';
import { unzipXml, zipFile } from '../src/modules/sunat/transport/zip';
import { buildSaleDocument } from '../src/modules/sunat/ubl/compute';
import { despatchXml } from '../src/modules/sunat/ubl/despatch-xml';
import { saleDocumentXml } from '../src/modules/sunat/ubl/invoice-xml';
import type { Issuer } from '../src/modules/sunat/ubl/model';
import { summaryXml, voidedXml } from '../src/modules/sunat/ubl/summary-xml';

const ISSUER: Issuer = { ruc: '20000000001', razonSocial: 'EMPRESA DE PRUEBAS S.A.C.', direccion: 'AV. LOS OLIVOS 123', ubigeo: '150101', departamento: 'LIMA', provincia: 'LIMA', distrito: 'LIMA', codigoAnexo: '0000' };
const OPTS = { number: 7, today: '2026-10-12', now: '10:00:00' };
const RUC_CLIENT = { cliente_tipo_de_documento: '6', cliente_numero_de_documento: '20100070970', cliente_denominacion: 'EMPRESA DE SERVICIOS S.A.C', cliente_direccion: 'AV. SAN MARTIN - LIMA' };
const DNI_CLIENT = { cliente_tipo_de_documento: '1', cliente_numero_de_documento: '75413811', cliente_denominacion: 'NOMBRE DEL CLIENTE' };
const item = (over: Record<string, unknown> = {}) => ({ unidad_de_medida: 'NIU', descripcion: 'Nombre del producto', cantidad: '1', valor_unitario: '234', porcentaje_igv: '18', codigo_tipo_afectacion_igv: '10', ...over });
const build = (input: Record<string, unknown>) => buildSaleDocument(SaleDocumentSchema.parse(input), ISSUER, OPTS);
const factura = (over: Record<string, unknown> = {}) => build({ documento: 'factura', serie: 'F001', ...RUC_CLIENT, items: [item()], ...over });
const boleta = (over: Record<string, unknown> = {}) => build({ documento: 'boleta', serie: 'B001', ...DNI_CLIENT, items: [item()], ...over });

describe('decimales exactos', () => {
  it('redondea la mitad hacia arriba, sin los errores de los floats', () => {
    expect(fmt(dec('1.005'))).toBe('1.01');
    expect(fmt(dec('2.675'))).toBe('2.68');
    expect(fmt(mul(dec('508.474576'), dec('0.18')))).toBe('91.53');
    expect(fmt(dec('-1.005'))).toBe('-1.01');
    expect(fmt(round(div(dec('90.50'), dec('1.18')), 2))).toBe('76.69');
  });

  it('suma, formatea y recorta ceros', () => {
    expect(fmt(add(dec('0.1'), dec('0.2')))).toBe('0.30');
    expect(fmtTrim(dec('254.2372880000'))).toBe('254.237288');
    expect(fmtTrim(dec('300'), 10, 2)).toBe('300.00');
    expect(fmt(dec(18), 0)).toBe('18');
    expect(() => dec('12,5')).toThrow();
  });
});

describe('utilidades', () => {
  it('monto en letras', () => {
    expect(amountInWords('600.00', 'PEN')).toBe('SEISCIENTOS CON 00/100 SOLES');
    expect(amountInWords('3411.38', 'PEN')).toBe('TRES MIL CUATROCIENTOS ONCE CON 38/100 SOLES');
    expect(amountInWords('1000000.00', 'USD')).toBe('UN MILLON CON 00/100 DÓLARES AMERICANOS');
    expect(amountInWords('21001.50', 'PEN')).toBe('VEINTIUN MIL UNO CON 50/100 SOLES');
    expect(amountInWords('0.00', 'PEN')).toBe('CERO CON 00/100 SOLES');
    expect(amountInWords('100.10', 'EUR')).toBe('CIEN CON 10/100 EUROS');
    expect(amountInWords('1516.00', 'PEN')).toBe('MIL QUINIENTOS DIECISEIS CON 00/100 SOLES');
  });

  it('RUC y DNI', () => {
    expect(isValidRuc('20131312955')).toBe(true);
    expect(isValidRuc('20131312956')).toBe(false);
    expect(isValidRuc('30131312955')).toBe(false);
    expect(rucFromDni('45215942')).toBe('10452159428');
  });

  it('ubigeos del INEI', () => {
    expect(ubigeoNames('150132')).toEqual({ departamento: 'LIMA', provincia: 'LIMA', distrito: 'SAN JUAN DE LURIGANCHO' });
    expect(ubigeoNames('999999')).toBeNull();
  });

  it('escapa XML y quita caracteres de control', () => {
    expect(esc('A & B <"\u0001\'>')).toBe('A &amp; B &lt;&quot;&apos;&gt;');
  });
});

/** Los totales que publica apisunat.pe para cada ejemplo de su documentación. */
describe('cálculo del comprobante', () => {
  const total = (doc: ReturnType<typeof build>) => fmt(doc.totals.payable);

  it('factura gravada: el IGV sale de la base sin redondear', () => {
    const doc = factura({ items: [item({ cantidad: '2', valor_unitario: '254.237288' })], total: '600.00' });
    expect(fmt(doc.totals.gravadas)).toBe('508.47');
    expect(fmt(doc.totals.igv)).toBe('91.53');
    expect(total(doc)).toBe('600.00');
    expect(fmtTrim(doc.lines[0].unitPrice, 6)).toBe('300');
    expect(doc.payment?.type).toBe('Contado');
    expect(doc.legends[0]).toEqual({ code: '1000', value: 'SEISCIENTOS CON 00/100 SOLES' });
  });

  it('exonerada, inafecta, exportación y tasas especiales', () => {
    expect(total(factura({ items: [item({ porcentaje_igv: '0', codigo_tipo_afectacion_igv: '20' })] }))).toBe('234.00');
    expect(total(boleta({ items: [item({ porcentaje_igv: '0', codigo_tipo_afectacion_igv: '30' })] }))).toBe('234.00');
    expect(total(factura({ moneda: 'USD', tipo_operacion: '0200', cliente_tipo_de_documento: '0', cliente_numero_de_documento: '123456', items: [item({ valor_unitario: '200', codigo_tipo_afectacion_igv: '40' })] }))).toBe('200.00');
    expect(total(boleta({ items: [item({ valor_unitario: '234.125457', porcentaje_igv: '10.50' })] }))).toBe('258.71');
    expect(total(boleta({ tipo_operacion: '0113', items: [item({ valor_unitario: '234.125457', porcentaje_igv: '0' })] }))).toBe('234.13');
  });

  it('gratuitas: no se cobran, pero informan valor referencial e IGV', () => {
    const retiro = boleta({ items: [item({ codigo_tipo_afectacion_igv: '11' })] });
    expect(total(retiro)).toBe('0.00');
    expect(fmt(retiro.totals.gratuitas)).toBe('234.00');
    expect(fmt(retiro.totals.igvGratuitas)).toBe('42.12');
    expect(fmt(retiro.totals.taxes)).toBe('0.00');
    expect(retiro.legends.map((l) => l.code)).toContain('1002');
    const transferencia = factura({ items: [item({ porcentaje_igv: '0', codigo_tipo_afectacion_igv: '21' })] });
    expect(fmt(transferencia.totals.igvGratuitas)).toBe('0.00');
  });

  it('descuentos por ítem y globales', () => {
    const d = (codigo: string) => [{ monto: '5.00', codigo }];
    expect(total(boleta({ items: [item({ cantidad: '2', valor_unitario: '234.125457', descuentos: d('00') })] }))).toBe('546.64');
    const noBase = boleta({ items: [item({ cantidad: '2', valor_unitario: '234.125457', descuentos: d('01') })] });
    expect(total(noBase)).toBe('547.54');
    expect(fmt(noBase.totals.discounts)).toBe('5.00');
    const g2 = boleta({ items: [item({ valor_unitario: '234.125457' })], descuentos: [{ monto: '50.00', codigo: '02' }] });
    expect(total(g2)).toBe('217.27');
    expect(fmt(g2.totals.gravadas)).toBe('184.13');
    expect(g2.allowances[0]).toMatchObject({ code: '02' });
    const g3 = boleta({ items: [item({ valor_unitario: '234.125457' })], descuentos: [{ monto: '50.00', codigo: '03' }] });
    expect(total(g3)).toBe('226.27');
    expect(fmt(g3.allowances[0].base)).toBe('276.27');
  });

  it('retención: se informa, no reduce el total', () => {
    const doc = factura({ items: [item({ cantidad: '3', valor_unitario: '1073.333333' })], descuentos: [{ monto: '113.99', codigo: '62' }], total: '3799.60' });
    expect(total(doc)).toBe('3799.60');
    expect(fmt(doc.retention!.percent)).toBe('3.00');
  });

  it('detracción con cuotas', () => {
    const doc = factura({
      tipo_operacion: '1001',
      items: [item({ valor_unitario: '850.151246' })],
      detraccion: { detraccion_tipo: '020', detraccion_porcentaje: '12', detraccion_total: '120.00', medio_de_pago: '001', numero_cuenta_banco_nacion: '00001234567' },
      cuotas: [{ importe: '883.18', fecha_de_pago: '2026-11-01' }],
      total: '1003.18',
    });
    expect(doc.payment).toMatchObject({ type: 'Credito' });
    expect(fmt(doc.payment!.pending!)).toBe('883.18');
    expect(doc.dueDate).toBe('2026-11-01');
    expect(doc.legends.map((l) => l.code)).toContain('2006');
    expect(() => factura({ items: [item()], detraccion: { detraccion_tipo: '020', detraccion_porcentaje: '12', detraccion_total: '10', numero_cuenta_banco_nacion: '00001234567' } })).toThrow();
  });

  it('anticipos: bajan la base y el total, no el valor de venta', () => {
    const doc = factura({ moneda: 'USD', items: [item({ valor_unitario: '100.50' }), item({ valor_unitario: '200.10' })], anticipos: [{ documento: 'factura', serie: 'F001', numero: '9', monto: '90.50' }], total: '264.21' });
    expect(fmt(doc.totals.value)).toBe('300.60');
    expect(fmt(doc.totals.gravadas)).toBe('223.91');
    expect(fmt(doc.totals.igv)).toBe('40.30');
    expect(fmt(doc.totals.priceWithTaxes)).toBe('354.71');
    expect(fmt(doc.totals.prepaid)).toBe('90.50');
    expect(doc.allowances[0]).toMatchObject({ code: '04' });
  });

  it('notas de crédito y débito', () => {
    const nc = build({ documento: 'nota_credito', serie: 'F001', ...RUC_CLIENT, nota_credito_codigo_tipo: '01', nota_credito_motivo: 'Anulación de la operación', documento_afectado: { documento: 'factura', serie: 'F001', numero: 128 }, items: [item({ cantidad: '5810', valor_unitario: '0.084746' }), item({ cantidad: '1569', valor_unitario: '0.084746' }), item({ cantidad: '48', valor_unitario: '0.084746' })], total: '742.70' });
    expect(nc.type).toBe('07');
    expect(nc.note).toEqual({ code: '01', reason: 'Anulación de la operación', affectedType: '01', affectedId: 'F001-128' });
    const nd = build({ documento: 'nota_debito', serie: 'F001', ...RUC_CLIENT, nota_debito_codigo_tipo: '02', nota_debito_motivo: 'Aumento en el valor', documento_afectado: { documento: 'factura', serie: 'F001', numero: 10 }, items: [item({ valor_unitario: '84.745763' })], total: '100' });
    expect(total(nd)).toBe('100.00');
  });

  it('rechaza un total que no cuadra, y dice cuál calculó', () => {
    try {
      factura({ total: '300.00' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SunatInputError);
      expect((e as SunatInputError).getResponse()).toMatchObject({ message: expect.stringContaining('276.12'), payload: { total_calculado: '276.12', total_igv: '42.12' } });
    }
    expect(total(factura({ total: '276.13' }))).toBe('276.12'); // un céntimo de tolerancia
  });

  it('una sola tasa de IGV por comprobante', () => {
    expect(() => boleta({ items: [item(), item({ porcentaje_igv: '10.5' })] })).toThrow(/una sola tasa/);
  });

  it('precio_unitario (con IGV): el total es exacto precio × cantidad y el IGV sale por diferencia', () => {
    const byPrice = (precio: string, cantidad = '1') => item({ valor_unitario: undefined, precio_unitario: precio, cantidad });
    const doc = boleta({ items: [byPrice('99'), byPrice('70')], total: '169.00' });
    expect(total(doc)).toBe('169.00');
    expect(fmt(add(doc.totals.gravadas, doc.totals.igv))).toBe('169.00');
    expect([fmt(doc.lines[0].value), fmt(doc.lines[0].igv), fmtTrim(doc.lines[0].unitPrice, 6)]).toEqual(['83.90', '15.10', '99']);

    // Todos los precios de S/ 0.10 a S/ 300 (de 10 en 10 céntimos) por 1 a 4 unidades: nunca se pasa ni le falta un
    // céntimo, y el IGV queda a un céntimo como mucho de valor × 18 % (SUNAT tolera ±1).
    for (let cents = 10; cents <= 30000; cents += 10) {
      for (let qty = 1; qty <= 4; qty++) {
        const precio = (cents / 100).toFixed(2);
        const line = boleta({ items: [byPrice(precio, String(qty))] }).lines[0];
        const expected = ((cents * qty) / 100).toFixed(2);
        expect([precio, qty, fmt(line.total)]).toEqual([precio, qty, expected]);
        expect(cmp(abs(sub(line.igv, round(mul(line.value, dec('0.18')), 2))), dec('0.01')) <= 0).toBe(true);
      }
    }
  });

  it('precio_unitario con una promo repartida (3 × S/ 100): S/ 33.3333333333 por prenda da S/ 100.00', () => {
    const doc = boleta({ items: [item({ valor_unitario: undefined, precio_unitario: '33.3333333333', cantidad: '3' })] });
    expect(total(doc)).toBe('100.00');
  });
});

describe('validación del pedido', () => {
  const issues = (input: Record<string, unknown>) => SaleDocumentSchema.safeParse(input).error?.issues.map((i) => i.message) ?? [];

  it('cada ítem lleva valor_unitario o precio_unitario; con los dos (como apisunat.pe) manda el valor', () => {
    const base = { documento: 'boleta', serie: 'B001', ...DNI_CLIENT };
    expect(issues({ ...base, items: [item({ valor_unitario: undefined })] })).toContain('items[0]: falta valor_unitario (sin IGV) o precio_unitario (con IGV)');
    expect(issues({ ...base, items: [item({ valor_unitario: undefined, precio_unitario: '99' })] })).toEqual([]);
    // El ejemplo de nota de débito de apisunat.pe manda los dos: se calcula con el valor, como siempre.
    const both = build({ ...base, items: [item({ valor_unitario: '84.745763', precio_unitario: '100' })] });
    expect(fmt(both.totals.payable)).toBe('100.00');
    expect(fmtTrim(both.lines[0].unitValue, 6)).toBe('84.745763');
  });

  it('serie, cliente y notas', () => {
    expect(issues({ documento: 'factura', serie: 'B001', ...RUC_CLIENT, items: [item()] })).toContain('La serie de una factura empieza con F');
    expect(issues({ documento: 'factura', serie: 'F001', ...DNI_CLIENT, items: [item()] })).toContain('Una factura se emite a un cliente con RUC (cliente_tipo_de_documento = 6)');
    expect(issues({ documento: 'boleta', serie: 'B001', ...DNI_CLIENT, cliente_numero_de_documento: '123', items: [item()] })).toContain('El DNI del cliente debe tener 8 dígitos');
    expect(issues({ documento: 'nota_credito', serie: 'F001', ...RUC_CLIENT, items: [item()] })).toContain('El campo documento_afectado es requerido en una nota');
    expect(issues({ documento: 'factura', serie: 'F001', ...RUC_CLIENT, items: [] })).toContain('El comprobante necesita al menos un ítem');
    expect(issues({ documento: 'factura', serie: 'F001', ...RUC_CLIENT, items: [item({ codigo_tipo_afectacion_igv: '99' })] })).toContain('items.codigo_tipo_afectacion_igv no es un código del catálogo 07');
  });

  it('acepta montos como número y completa los valores por defecto', () => {
    const dto = SaleDocumentSchema.parse({ documento: 'boleta', serie: 'b001', numero: '15', ...DNI_CLIENT, cliente_tipo_de_documento: 1, cliente_numero_de_documento: 75413811, items: [{ descripcion: 'Polo', cantidad: 2, valor_unitario: 42.372881 }] });
    expect(dto).toMatchObject({ serie: 'B001', numero: 15, moneda: 'PEN', tipo_operacion: '0101', cliente_numero_de_documento: '75413811' });
    expect(dto.items[0]).toMatchObject({ unidad_de_medida: 'NIU', porcentaje_igv: '18', codigo_tipo_afectacion_igv: '10', cantidad: '2' });
  });

  it('bajas y resúmenes', () => {
    expect(VoidedSchema.parse({ documento_afectado: { documento: 'factura', serie: 'F001', numero: '192' } })).toMatchObject({ motivo: 'ANULACIÓN DE OPERACIÓN' });
    expect(VoidedSchema.safeParse({}).success).toBe(false);
    const rc = DailySummarySchema.parse({ documentos_afectados: [{ documento: 'boleta', serie: 'B001', numero: '1', accion_resumen: 'anular' }, { documento: 'boleta', serie: 'B002', numero: 3583, tipo_operacion: 'anulacion' }, { documento: 'boleta', serie: 'B001', numero: 2, accion_resumen: 'adicionar' }] });
    expect(rc.documentos_afectados.map((d) => d.accion)).toEqual(['3', '3', '1']);
    expect(DailySummarySchema.safeParse({ documentos_afectados: [{ documento: 'boleta', serie: 'F001', numero: 1 }] }).success).toBe(false);
  });

  it('guías: alias de apisunat.pe y reglas por modalidad', () => {
    const base = { documento: 'guia_remision_remitente', serie: 'T001', destinatario_tipo_de_documento: '6', destinatario_numero_de_documento: '20609286696', destinatario_denominacion: 'X', punto_de_partida_ubigeo: '150132', punto_de_partida_direccion: 'A', punto_de_llegada_ubigeo: '150122', punto_de_llegada_direccion: 'B', peso_bruto_total: '1.9', items: [{ descripcion: 'DISCO', cantidad: 1 }] };
    const ok = DespatchSchema.parse({ ...base, tipo_transporte: '02', motivo_traslado: '01', fecha_inicio_de_traslado: '2026-10-12', vehiculos: [{ numero_de_placa: 'f6y-931' }], conductores: [{ numero_de_documento: '47101979', nombres: 'JUAN', apellidos: 'GONZALES', numero_licencia_conducir: 'Q43101919' }] });
    expect(ok).toMatchObject({ modalidad_de_transporte: '02', motivo_de_traslado: '01', peso_bruto_unidad_de_medida: 'KGM' });
    expect(ok.vehiculos?.[0].numero_de_placa).toBe('F6Y931');
    const messages = (input: Record<string, unknown>) => DespatchSchema.safeParse(input).error?.issues.map((i) => i.message) ?? [];
    expect(messages({ ...base, modalidad_de_transporte: '01', motivo_de_traslado: '01' })).toContain('En transporte público (01) el campo transportista es requerido');
    expect(messages({ ...base, modalidad_de_transporte: '02', motivo_de_traslado: '01', fecha_inicio_de_traslado: '2026-10-12' })).toContain('En transporte privado (02) hace falta el vehículo (o indicador_vehiculo_m1_l)');
    expect(messages({ documento: 'otro' })[0]).toMatch(/guia_remision_remitente/);
  });
});

describe('XML UBL 2.1', () => {
  it('factura: estructura que valida SUNAT', () => {
    const xml = saleDocumentXml(factura({ items: [item({ cantidad: '2', valor_unitario: '254.237288', codigo_interno: 'P&1' })], orden_compra_servicio: 'OC-1', observacion: 'Entrega <hoy>' }));
    expect(xml).toContain('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
    expect(xml).toContain('<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>');
    expect(xml).toContain('<cbc:ID>F001-7</cbc:ID><cbc:IssueDate>2026-10-12</cbc:IssueDate><cbc:IssueTime>10:00:00</cbc:IssueTime>');
    expect(xml).toContain('<cbc:InvoiceTypeCode listID="0101">01</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:Note languageLocaleID="1000">SEISCIENTOS CON 00/100 SOLES</cbc:Note><cbc:Note>Entrega &lt;hoy&gt;</cbc:Note>');
    expect(xml).toContain('<cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Contado</cbc:PaymentMeansID></cac:PaymentTerms>');
    expect(xml).toContain('<cbc:TaxableAmount currencyID="PEN">508.47</cbc:TaxableAmount><cbc:TaxAmount currencyID="PEN">91.53</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="PEN">600.00</cbc:PayableAmount>');
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="NIU">2</cbc:InvoicedQuantity>');
    expect(xml).toContain('<cbc:PriceAmount currencyID="PEN">254.237288</cbc:PriceAmount>');
    expect(xml).toContain('<cac:SellersItemIdentification><cbc:ID>P&amp;1</cbc:ID></cac:SellersItemIdentification>');
    expect(xml).toContain('<cbc:AddressTypeCode>0000</cbc:AddressTypeCode>');
  });

  it('notas, resumen, baja y guía usan su propio esquema', () => {
    const nc = saleDocumentXml(build({ documento: 'nota_credito', serie: 'B001', ...DNI_CLIENT, nota_credito_codigo_tipo: '01', nota_credito_motivo: 'Anulación', documento_afectado: { documento: 'boleta', serie: 'B001', numero: 15 }, items: [item()] }));
    expect(nc).toContain('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"');
    expect(nc).toContain('<cac:DiscrepancyResponse><cbc:ReferenceID>B001-15</cbc:ReferenceID><cbc:ResponseCode>01</cbc:ResponseCode>');
    expect(nc).toContain('<cbc:CreditedQuantity unitCode="NIU">1</cbc:CreditedQuantity>');
    expect(nc).not.toContain('InvoiceTypeCode');

    const rc = summaryXml({ id: 'RC-20261012-1', referenceDate: '2026-10-10', issueDate: '2026-10-12', issuer: ISSUER, lines: [{ action: '3', document: boleta() }] });
    expect(rc).toContain('<cbc:ID>RC-20261012-1</cbc:ID><cbc:ReferenceDate>2026-10-10</cbc:ReferenceDate><cbc:IssueDate>2026-10-12</cbc:IssueDate>');
    expect(rc).toContain('<cac:Status><cbc:ConditionCode>3</cbc:ConditionCode></cac:Status><sac:TotalAmount currencyID="PEN">276.12</sac:TotalAmount>');

    const ra = voidedXml({ id: 'RA-20261012-1', referenceDate: '2026-10-10', issueDate: '2026-10-12', issuer: ISSUER, lines: [{ type: '01', series: 'F001', number: 192, reason: 'ANULACIÓN DE OPERACIÓN' }] });
    expect(ra).toContain('<sac:DocumentSerialID>F001</sac:DocumentSerialID><sac:DocumentNumberID>192</sac:DocumentNumberID>');

    const gre = despatchXml(
      CarrierDespatchSchema.parse({
        documento: 'guia_remision_transportista', serie: 'V001', fecha_inicio_de_traslado: '2026-10-12', peso_bruto_total: '1.9', numero_de_registro_mtc: '1519036CNG',
        punto_de_partida_ubigeo: '150132', punto_de_partida_direccion: 'A', punto_de_llegada_ubigeo: '150122', punto_de_llegada_direccion: 'B',
        destinatario: { tipo_de_documento: '6', numero_de_documento: '20609286696', denominacion: 'DESTINO SAC' }, remitente: { tipo_de_documento: '6', numero_de_documento: '20512528458', denominacion: 'REMITENTE SAC' },
        conductores: [{ numero_de_documento: '47101979', nombres: 'JUAN', apellidos: 'GONZALES', numero_licencia_conducir: 'Q43101919' }], vehiculos: [{ numero_de_placa: 'F6Y931', tarjeta_unica_de_cirulacion: '1548854CNG' }],
        documentos_relacionados: [{ documento: 'guia_remision', serie: 'T001', numero: '3108', ruc_emisor: '20512528458' }], pagador_flete: 'remitente',
      }),
      ISSUER,
      { number: 3, issueDate: '2026-10-12', issueTime: '10:00:00' },
    );
    expect(gre).toContain('>31</cbc:DespatchAdviceTypeCode>');
    expect(gre).toContain('<cbc:SpecialInstructions>SUNAT_Envio_IndicadorPagadorFlete_Remitente</cbc:SpecialInstructions>');
    expect(gre).toContain('<cac:DespatchParty>');
    expect(gre).toContain('<cbc:RegistrationNationalityID>1548854CNG</cbc:RegistrationNationalityID>');
    // Sin ítems, una línea que remite a la guía del remitente (el esquema exige al menos una).
    expect(gre).toContain('<cbc:Description>BIENES SEGÚN GUÍA DE REMISIÓN REMITENTE T001-3108</cbc:Description>');
  });
});

describe('firma digital', () => {
  const xml = saleDocumentXml(factura());

  it('firma dentro de ExtensionContent y la firma verifica', () => {
    const cert = testCertificate();
    const signed = signXml(xml, cert);
    expect(signed.xml).toMatch(/<ext:ExtensionContent><ds:Signature Id="SignatureMT"/);
    expect(signed.hash).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    const signature = /<ds:Signature[\s\S]*<\/ds:Signature>/.exec(signed.xml)![0];
    const verifies = (document: string) => {
      const verifier = new SignedXml({ publicCert: cert.certificatePem });
      verifier.loadSignature(signature);
      try {
        return verifier.checkSignature(document);
      } catch {
        return false;
      }
    };
    expect(verifies(signed.xml)).toBe(true);
    expect(verifies(signed.xml.replace('276.12', '999.99'))).toBe(false);
  });

  it('lee .pfx/.p12 con cifrado moderno (AES) y antiguo (3DES)', () => {
    const cert = testCertificate();
    for (const algorithm of ['aes256', '3des'] as const) {
      const p12 = forge.pkcs12.toPkcs12Asn1(forge.pki.privateKeyFromPem(cert.privateKeyPem), [forge.pki.certificateFromPem(cert.certificatePem)], 'clave-123', { algorithm });
      const pfx = Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
      expect(certificateBody(parseCertificate(pfx, 'clave-123').certificatePem)).toBe(certificateBody(cert.certificatePem));
      expect(() => parseCertificate(pfx, 'otra')).toThrow(/clave es incorrecta/);
    }
  });

  it('lee certificados PEM y valida que la llave corresponda', () => {
    const cert = testCertificate();
    const parsed = parseCertificate(Buffer.from(`${cert.privateKeyPem}\n${cert.certificatePem}`));
    expect(certificateBody(parsed.certificatePem)).toBe(certificateBody(cert.certificatePem));
    expect(certificateInfo(parsed.certificatePem)).toMatchObject({ subject: expect.stringContaining('CERTIFICADO DE PRUEBAS') });
    expect(() => parseCertificate(Buffer.from(cert.certificatePem))).toThrow(SunatInputError);
    expect(() => parseCertificate(Buffer.from('no es un certificado'))).toThrow(SunatInputError);
  });
});

describe('transporte', () => {
  it('zip de ida y vuelta', () => {
    expect(unzipXml(zipFile('20000000001-01-F001-1.xml', '<a>ñ</a>'))).toEqual({ name: '20000000001-01-F001-1.xml', xml: '<a>ñ</a>' });
  });

  it('interpreta el CDR', () => {
    const cdr = parseCdrXml(
      '<ar:ApplicationResponse xmlns:ar="urn:a" xmlns:cbc="urn:b" xmlns:cac="urn:c"><cbc:Note>4287 - El precio unitario de la operaci&amp;#243;n difiere</cbc:Note>' +
        '<cac:DocumentResponse><cac:Response><cbc:ReferenceID>F001-1</cbc:ReferenceID><cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>La Factura numero F001-1, ha sido aceptada</cbc:Description></cac:Response></cac:DocumentResponse></ar:ApplicationResponse>',
    );
    expect(cdr).toMatchObject({ code: '0', accepted: true, description: 'La Factura numero F001-1, ha sido aceptada', notes: ['4287 - El precio unitario de la operación difiere'] });
  });

  const soap = (body: string) => `<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"><soap-env:Body>${body}</soap-env:Body></soap-env:Envelope>`;
  const client = (responses: Array<{ status: number; body: string }>) => {
    const calls: string[] = [];
    const fetch = (async (_url: unknown, init: { body: string }) => {
      calls.push(init.body);
      const next = responses.shift()!;
      return { status: next.status, text: async () => next.body };
    }) as unknown as typeof globalThis.fetch;
    return { api: new BillServiceClient({ fetch, retryDelayMs: 1 }), calls };
  };
  const sol = { ruc: '20000000001', ...BETA_SOL };

  it('sendBill: manda el usuario SOL y devuelve el CDR', async () => {
    const { api, calls } = client([{ status: 200, body: soap('<br:sendBillResponse xmlns:br="http://service.sunat.gob.pe"><applicationResponse>UEs=</applicationResponse></br:sendBillResponse>') }]);
    expect((await api.sendBill('beta', sol, 'x.zip', Buffer.from('zip'))).toString('base64')).toBe('UEs=');
    expect(calls[0]).toContain('<wsse:Username>20000000001MODDATOS</wsse:Username>');
    expect(calls[0]).toContain(`<fileName>x.zip</fileName><contentFile>${Buffer.from('zip').toString('base64')}</contentFile>`);
  });

  it('distingue el rechazo del comprobante de una caída de SUNAT', async () => {
    const rejected = client([{ status: 500, body: soap('<soap-env:Fault><faultcode>soap-env:Client.2335</faultcode><faultstring>El documento electrónico ingresado ha sido alterado</faultstring></soap-env:Fault>') }]);
    await expect(rejected.api.sendBill('beta', sol, 'x.zip', Buffer.from('z'))).rejects.toMatchObject({ code: '2335', transient: false });

    const busy = client([{ status: 500, body: soap('<soap-env:Fault><faultcode>soap-env:Server</faultcode><faultstring>0109</faultstring><detail><message>El sistema no puede responder su solicitud</message></detail></soap-env:Fault>') }]);
    const fault = (await busy.api.sendBill('beta', sol, 'x.zip', Buffer.from('z')).catch((e) => e)) as SunatFault;
    expect(fault).toBeInstanceOf(SunatFault);
    expect(fault).toMatchObject({ code: '0109', transient: true, message: 'El sistema no puede responder su solicitud' });
  });

  it('reintenta cuando SUNAT corta la ráfaga con un 401 sin SOAP', async () => {
    const html = { status: 401, body: '<html>401 Authorization Required</html>' };
    const ok = { status: 200, body: soap('<br:sendSummaryResponse xmlns:br="http://service.sunat.gob.pe"><ticket>123</ticket></br:sendSummaryResponse>') };
    const retried = client([html, html, ok]);
    expect(await retried.api.sendSummary('beta', sol, 'x.zip', Buffer.from('z'))).toBe('123');
    expect(retried.calls).toHaveLength(3);
    await expect(client([html, html, html, html]).api.sendSummary('beta', sol, 'x.zip', Buffer.from('z'))).rejects.toBeInstanceOf(SunatUnavailable);
  });
});

describe('padrón del RUC', () => {
  /** Un índice en miniatura con el formato de scripts/padron-build.mjs. */
  function tinyPadron(blocks: string[][]): BlobSource & { reads: string[] } {
    const gz = blocks.map((rows) => gzipSync(Buffer.from(rows.map((r) => `${r}\n`).join(''), 'utf8')));
    const index = Buffer.alloc(blocks.length * 20);
    let offset = 0;
    gz.forEach((b, i) => {
      index.writeDoubleLE(Number(blocks[i][0].slice(0, 11)), i * 20);
      index.writeDoubleLE(offset, i * 20 + 8);
      index.writeUInt32LE(b.length, i * 20 + 16);
      offset += b.length;
    });
    const files: Record<string, Buffer> = {
      'current.json': Buffer.from('{"path":"v1"}'),
      'v1/manifest.json': Buffer.from(JSON.stringify({ version: '2026-10-12', records: blocks.flat().length, blocks: blocks.length, data: 'data.bin', index: 'index.bin' })),
      'v1/index.bin': index,
      'v1/data.bin': Buffer.concat(gz),
    };
    const reads: string[] = [];
    return {
      reads,
      async read(name, range) {
        reads.push(name);
        if (!files[name]) throw new Error(`no existe ${name}`);
        return range ? files[name].subarray(range.start, range.end + 1) : files[name];
      },
    };
  }

  it('si los archivos cambian bajo un índice ya cargado, se recarga solo', async () => {
    const v1 = tinyPadron([['20131312955|SUNAT|ACTIVO|HABIDO|150101|AV. GARCILASO'], ['20553300429|TECNIGAS|ACTIVO|HABIDO|150132|AV. LURIGANCHO']]);
    const v2 = tinyPadron([['20100070970|SUPERMERCADOS|ACTIVO|HABIDO|150130|CAL. MORELLI', '20131312955|SUNAT NUEVA|ACTIVO|HABIDO|150101|AV. GARCILASO'], ['20553300429|TECNIGAS NUEVA|ACTIVO|HABIDO|150132|AV. LURIGANCHO']]);
    let current: BlobSource = v1;
    const reader = new PadronReader({ read: (name, range) => current.read(name, range) });
    expect(await reader.find('20553300429')).toMatchObject({ nombre: 'TECNIGAS' });
    current = v2; // se pisaron los archivos en la misma carpeta
    expect(await reader.find('20131312955')).toMatchObject({ nombre: 'SUNAT NUEVA' });
    expect(await reader.find('20100070970')).toMatchObject({ nombre: 'SUPERMERCADOS' });
  });

  it('encuentra un RUC leyendo un solo bloque', async () => {
    const source = tinyPadron([
      ['10082365937|PFLUCKER MARTINEZ MARIA ISABEL|BAJA DE OFICIO|HABIDO||', '10452159428|GARCIA CHANCO CARLOS AUGUSTO|ACTIVO|HABIDO||'],
      ['20131312955|SUNAT|ACTIVO|HABIDO|150101|AV. GARCILASO DE LA VEGA NRO. 1472', '20553300429|TECNIGAS CORPORACION S.A.|ACTIVO|HABIDO|150132|AV. LURIGANCHO NRO. 626 URB. AZCARRUZ BAJO'],
    ]);
    const reader = new PadronReader(source);
    expect(await reader.find('20553300429')).toEqual({ ruc: '20553300429', nombre: 'TECNIGAS CORPORACION S.A.', estado: 'ACTIVO', condicion: 'HABIDO', ubigeo: '150132', direccion: 'AV. LURIGANCHO NRO. 626 URB. AZCARRUZ BAJO' });
    expect(await reader.find('10452159428')).toMatchObject({ nombre: 'GARCIA CHANCO CARLOS AUGUSTO', ubigeo: null, direccion: null });
    expect(await reader.find('10082365937')).toMatchObject({ estado: 'BAJA DE OFICIO' });
    expect(await reader.find('20131312954')).toBeNull();
    expect(await reader.find('10000000001')).toBeNull();
    expect(await reader.info()).toEqual({ version: '2026-10-12', records: 4 });
    // El índice se carga una vez y cada bloque se lee una sola vez.
    expect(source.reads.filter((r) => r === 'v1/index.bin')).toHaveLength(1);
    expect(source.reads.filter((r) => r === 'v1/data.bin')).toHaveLength(2);
  });
});
