import { describe, expect, it } from 'vitest';
import { SaleDocumentSchema } from '../src/modules/sunat/dto/document.dto';
import { buildSaleDocument } from '../src/modules/sunat/ubl/compute';
import { saleDocumentXml } from '../src/modules/sunat/ubl/invoice-xml';
import type { Issuer } from '../src/modules/sunat/ubl/model';
import { signXml } from '../src/modules/sunat/signing/xml-signer';
import { testCertificate } from '../src/modules/sunat/signing/test-certificate';
import { BETA_SOL, BillServiceClient, SunatFault } from '../src/modules/sunat/transport/bill-service';
import { parseCdrZip } from '../src/modules/sunat/transport/cdr';
import { zipFile } from '../src/modules/sunat/transport/zip';

/**
 * Envíos reales al entorno beta de SUNAT (no tienen validez tributaria).
 * Solo corre con SUNAT_BETA=1: depende de la red y de que beta esté arriba.
 */
const enabled = process.env.SUNAT_BETA === '1';

export const ISSUER: Issuer = {
  ruc: '20000000001',
  razonSocial: 'EMPRESA DE PRUEBAS S.A.C.',
  nombreComercial: 'PRUEBAS',
  direccion: 'AV. LOS OLIVOS 123',
  ubigeo: '150101',
  departamento: 'LIMA',
  provincia: 'LIMA',
  distrito: 'LIMA',
  codigoAnexo: '0000',
};

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const number = () => Math.floor(Date.now() / 1000) % 90_000_000;

export async function emit(input: Record<string, unknown>) {
  const dto = SaleDocumentSchema.parse({ fecha_de_emision: today(), ...input });
  const doc = buildSaleDocument(dto, ISSUER, { number: number(), today: today(), now: '10:00:00' });
  const signed = signXml(saleDocumentXml(doc), testCertificate());
  const name = `${ISSUER.ruc}-${doc.type}-${doc.series}-${doc.number}`;
  const client = new BillServiceClient();
  try {
    const cdrZip = await client.sendBill('beta', { ruc: ISSUER.ruc, ...BETA_SOL }, `${name}.zip`, zipFile(`${name}.xml`, signed.xml));
    return { doc, signed, cdr: parseCdrZip(cdrZip) };
  } catch (e) {
    if (e instanceof SunatFault) return { doc, signed, fault: { code: e.code, message: e.message } };
    throw e;
  }
}

const RUC_CLIENT = {
  cliente_tipo_de_documento: '6',
  cliente_numero_de_documento: '20100070970',
  cliente_denominacion: 'EMPRESA DE SERVICIOS S.A.C',
  cliente_direccion: 'AV. SAN MARTIN - LIMA',
};
const DNI_CLIENT = {
  cliente_tipo_de_documento: '1',
  cliente_numero_de_documento: '75413811',
  cliente_denominacion: 'NOMBRE DEL CLIENTE',
  cliente_direccion: 'AV. SAN MARTIN - LIMA',
};
const item = (over: Record<string, unknown> = {}) => ({
  unidad_de_medida: 'NIU',
  descripcion: 'Nombre del producto',
  cantidad: '1',
  valor_unitario: '234',
  porcentaje_igv: '18',
  codigo_tipo_afectacion_igv: '10',
  nombre_tributo: 'IGV',
  ...over,
});
const inDays = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(Date.now() + n * 86_400_000));

/** Los ejemplos de la documentación de apisunat.pe, con el total que ellos publican. */
const CASES: Array<[string, Record<string, unknown>]> = [
  ['factura simple', { documento: 'factura', serie: 'F001', ...RUC_CLIENT, items: [item({ cantidad: '2', valor_unitario: '254.237288', codigo_interno: 'PROD001' })], total: '600.00', observacion: 'Se entregó el producto' }],
  ['factura al crédito', { documento: 'factura', serie: 'F001', ...RUC_CLIENT, fecha_de_vencimiento: inDays(12), cuotas: [{ importe: '100.00', fecha_de_pago: inDays(7) }, { importe: '176.12', fecha_de_pago: inDays(12) }], items: [item()], total: '276.12' }],
  ['factura exonerada', { documento: 'factura', serie: 'F001', ...RUC_CLIENT, items: [item({ porcentaje_igv: '0', codigo_tipo_afectacion_igv: '20', nombre_tributo: 'EXO' })], total: '234' }],
  ['factura gratuita', { documento: 'factura', serie: 'F001', ...RUC_CLIENT, items: [item({ porcentaje_igv: '0', codigo_tipo_afectacion_igv: '21', nombre_tributo: 'GRA' })], total: '0' }],
  ['factura de exportación', { documento: 'factura', serie: 'F001', moneda: 'USD', tipo_operacion: '0200', cliente_tipo_de_documento: '0', cliente_numero_de_documento: '123456', cliente_denominacion: 'NOMBRE PERSONA', cliente_direccion: 'DIRECCIÓN', items: [item({ unidad_de_medida: 'ZZ', descripcion: 'Nombre del servicio', valor_unitario: '200', porcentaje_igv: '0', codigo_tipo_afectacion_igv: '40', nombre_tributo: 'EXP' })], total: '200' }],
  ['factura con detracción', { documento: 'factura', serie: 'F001', tipo_operacion: '1001', ...RUC_CLIENT, items: [item({ valor_unitario: '850.151246' })], detraccion: { detraccion_tipo: '020', detraccion_porcentaje: '12', detraccion_total: '120.00', medio_de_pago: '001', numero_cuenta_banco_nacion: '00001234567' }, cuotas: [{ importe: '883.18', fecha_de_pago: inDays(20) }], total: '1003.18' }],
  ['factura con placa', { documento: 'factura', serie: 'F001', ...RUC_CLIENT, items: [item({ unidad_de_medida: 'GLL', descripcion: 'DIESEL B-5', cantidad: '10', valor_unitario: '16.101695', vehiculo_automotor: { numero_de_placa: 'PLA001' } })], total: '190.00' }],
  ['factura con anticipos', { documento: 'factura', serie: 'F001', moneda: 'USD', ...RUC_CLIENT, orden_compra_servicio: 'PRUEBA-123', fecha_de_vencimiento: inDays(10), items: [item({ descripcion: 'PRODUCTO 01', valor_unitario: '100.50' }), item({ descripcion: 'PRODUCTO 02', valor_unitario: '200.10' })], anticipos: [{ documento: 'factura', serie: 'F001', numero: '9', monto: '90.50' }], total: '264.21', cuotas: [{ importe: '264.21', fecha_de_pago: inDays(10) }] }],
  ['factura con anexo', { documento: 'factura', serie: 'F001', ...RUC_CLIENT, emisor_codigo_de_anexo: '0001', emisor_direccion: 'AV. POBLADO - LIMA', items: [item({ cantidad: '2', valor_unitario: '254.237288' })], total: '600.00' }],
  ['factura con retención', { documento: 'factura', serie: 'F001', ...RUC_CLIENT, items: [item({ cantidad: '3', valor_unitario: '1073.333333' })], descuentos: [{ monto: '113.99', codigo: '62' }], total: '3799.60' }],
  ['boleta simple 18%', { documento: 'boleta', serie: 'B001', ...DNI_CLIENT, items: [item({ valor_unitario: '234.125457' })], total: '276.27' }],
  ['boleta simple 10.5%', { documento: 'boleta', serie: 'B001', ...DNI_CLIENT, items: [item({ valor_unitario: '234.125457', porcentaje_igv: '10.50' })], total: '258.71' }],
  ['boleta NRUS', { documento: 'boleta', serie: 'B001', tipo_operacion: '0113', ...DNI_CLIENT, items: [item({ valor_unitario: '234.125457', porcentaje_igv: '0' })], total: '234.13' }],
  ['boleta sin DNI', { documento: 'boleta', serie: 'B001', cliente_tipo_de_documento: '1', cliente_numero_de_documento: '99999999', cliente_denominacion: 'CLIENTE VARIOS', cliente_direccion: '-', items: [item()], total: '276.12' }],
  ['boleta cliente extranjero', { documento: 'boleta', serie: 'B001', cliente_tipo_de_documento: 'B', cliente_numero_de_documento: '123456789', cliente_denominacion: 'Nombre de la persona extranjera', cliente_direccion: 'Av. Ciudad, Italia', items: [item()], total: '276.12' }],
  ['boleta descuento ítem 00', { documento: 'boleta', serie: 'B001', ...DNI_CLIENT, items: [item({ cantidad: '2', valor_unitario: '234.125457', descuentos: [{ monto: '5.00', codigo: '00' }] })], total: '546.64' }],
  ['boleta descuento ítem 01', { documento: 'boleta', serie: 'B001', ...DNI_CLIENT, items: [item({ cantidad: '2', valor_unitario: '234.125457', descuentos: [{ monto: '5.00', codigo: '01' }] })], total: '547.54' }],
  ['boleta descuento global 02', { documento: 'boleta', serie: 'B001', ...DNI_CLIENT, items: [item({ valor_unitario: '234.125457' })], descuentos: [{ monto: '50.00', codigo: '02' }], total: '217.27' }],
  ['boleta descuento global 03', { documento: 'boleta', serie: 'B001', ...DNI_CLIENT, items: [item({ valor_unitario: '234.125457' })], descuentos: [{ monto: '50.00', codigo: '03' }], total: '226.27' }],
  ['boleta inafecta', { documento: 'boleta', serie: 'B001', ...DNI_CLIENT, items: [item({ valor_unitario: '234.00', porcentaje_igv: '0', codigo_tipo_afectacion_igv: '30', nombre_tributo: 'INA' })], total: '234' }],
  ['boleta exonerada', { documento: 'boleta', serie: 'B001', ...RUC_CLIENT, items: [item({ porcentaje_igv: '0', codigo_tipo_afectacion_igv: '20', nombre_tributo: 'EXO' })], total: '234' }],
  ['boleta gratuita (retiro, 11)', { documento: 'boleta', serie: 'B001', ...RUC_CLIENT, items: [item({ codigo_tipo_afectacion_igv: '11', nombre_tributo: 'GRA' })], total: '0' }],
  ['boleta gratuita (21)', { documento: 'boleta', serie: 'B001', ...RUC_CLIENT, items: [item({ porcentaje_igv: '0', codigo_tipo_afectacion_igv: '21', nombre_tributo: 'GRA' })], total: '0' }],
  ['boleta de exportación', { documento: 'boleta', serie: 'B001', moneda: 'USD', tipo_operacion: '0200', cliente_tipo_de_documento: 'B', cliente_numero_de_documento: '123456', cliente_denominacion: 'NOMBRE PERSONA', cliente_direccion: 'DIRECCIÓN', items: [item({ unidad_de_medida: 'ZZ', descripcion: 'Nombre del servicio', valor_unitario: '200', porcentaje_igv: '0', codigo_tipo_afectacion_igv: '40', nombre_tributo: 'EXP' })], total: '200' }],
  ['nota de crédito: anulación', { documento: 'nota_credito', serie: 'F001', ...RUC_CLIENT, nota_credito_codigo_tipo: '01', nota_credito_motivo: 'Anulación de la operación', documento_afectado: { documento: 'factura', serie: 'F001', numero: 128 }, items: [item({ unidad_de_medida: 'ZZ', descripcion: 'SERVICIO 01', cantidad: '5810', valor_unitario: '0.084746' }), item({ unidad_de_medida: 'ZZ', descripcion: 'SERVICIO 02', cantidad: '1569', valor_unitario: '0.084746' }), item({ unidad_de_medida: 'ZZ', descripcion: 'SERVICIO 03', cantidad: '48', valor_unitario: '0.084746' })], total: '742.70' }],
  ['nota de crédito: descuento global', { documento: 'nota_credito', serie: 'F001', ...RUC_CLIENT, nota_credito_codigo_tipo: '04', nota_credito_motivo: 'Descuento global', documento_afectado: { documento: 'factura', serie: 'F001', numero: 128 }, items: [item({ unidad_de_medida: 'ZZ', descripcion: 'DESCUENTO DEL 10% POR PRONTO PAGO', valor_unitario: '100' })], total: '118.00' }],
  ['nota de crédito: corrección de descripción', { documento: 'nota_credito', serie: 'F001', ...RUC_CLIENT, nota_credito_codigo_tipo: '03', nota_credito_motivo: 'Corrección por error en la descripción', documento_afectado: { documento: 'factura', serie: 'F001', numero: 128 }, items: [item({ unidad_de_medida: 'ZZ', descripcion: 'Corrección: AGUA MINERAL DE 1.5L', valor_unitario: '0' })], total: '0' }],
  ['nota de crédito: fechas y cuotas', { documento: 'nota_credito', serie: 'F001', ...RUC_CLIENT, nota_credito_codigo_tipo: '13', nota_credito_motivo: 'Corrección de fecha de vencimiento y cuotas', documento_afectado: { documento: 'factura', serie: 'F001', numero: 197 }, items: [item({ unidad_de_medida: 'ZZ', descripcion: 'SERVICIO DE MANTENIMIENTO', valor_unitario: '0' })], cuotas: [{ importe: '236', fecha_de_pago: inDays(17) }], total: '0' }],
  ['nota de crédito de boleta', { documento: 'nota_credito', serie: 'B001', ...DNI_CLIENT, nota_credito_codigo_tipo: '01', nota_credito_motivo: 'Anulación de la operación', documento_afectado: { documento: 'boleta', serie: 'B001', numero: 15 }, items: [item()], total: '276.12' }],
  ['nota de débito', { documento: 'nota_debito', serie: 'F001', ...RUC_CLIENT, nota_debito_codigo_tipo: '02', nota_debito_motivo: 'Aumento en el valor', documento_afectado: { documento: 'factura', serie: 'F001', numero: 10 }, items: [item({ unidad_de_medida: 'ZZ', descripcion: 'PRODUCTO 1 - AUMENTO POR COSTOS DE IMPORTACIÓN', valor_unitario: '84.745763', precio_unitario: '100' })], total: '100' }],
];

const only = process.env.SUNAT_CASE;

describe.skipIf(!enabled)('SUNAT beta: los ejemplos de la documentación', () => {
  let n = number();
  for (const [name, input] of CASES) {
    it.skipIf(!!only && !name.includes(only))(name, async () => {
      const r = await emit({ numero: (n += 1), ...input });
      const summary = r.fault ? `FAULT ${r.fault.code}: ${r.fault.message}` : `CDR ${r.cdr!.code}: ${r.cdr!.description}${r.cdr!.notes.length ? `\n    OBS: ${r.cdr!.notes.join('\n    OBS: ')}` : ''}`;
      console.log(`>> ${name}\n    ${summary}`);
      if (process.env.SUNAT_DUMP) console.log(r.signed.xml);
      expect(r.fault).toBeUndefined();
      expect(r.cdr?.accepted).toBe(true);
      expect(r.cdr?.notes).toEqual([]);
    }, 60_000);
  }
});

describe.skipIf(!enabled)('SUNAT beta: valida de verdad', () => {
  const send = async (mutate: (xml: string) => string, resign: boolean) => {
    const dto = SaleDocumentSchema.parse({ documento: 'factura', serie: 'F001', fecha_de_emision: today(), ...RUC_CLIENT, items: [item()] });
    const doc = buildSaleDocument(dto, ISSUER, { number: number() + 500, today: today(), now: '10:00:00' });
    const xml = resign ? signXml(mutate(saleDocumentXml(doc)), testCertificate()).xml : mutate(signXml(saleDocumentXml(doc), testCertificate()).xml);
    const name = `${ISSUER.ruc}-01-F001-${doc.number}`;
    try {
      const zip = await new BillServiceClient().sendBill('beta', { ruc: ISSUER.ruc, ...BETA_SOL }, `${name}.zip`, zipFile(`${name}.xml`, xml));
      const cdr = parseCdrZip(zip);
      return `CDR ${cdr.code}: ${cdr.description} ${cdr.notes.join(' | ')}`;
    } catch (e) {
      if (e instanceof SunatFault) return `FAULT ${e.code}: ${e.message}`;
      throw e;
    }
  };

  it('rechaza un XML alterado después de firmar', async () => {
    const r = await send((xml) => xml.replace('>276.12<', '>276.13<'), false);
    console.log(`>> alterado: ${r}`);
    expect(r).toMatch(/^FAULT 2335/);
  }, 60_000);

  it('rechaza un IGV que no cuadra', async () => {
    const r = await send((xml) => xml.replace(/<cbc:TaxAmount currencyID="PEN">42.12<\/cbc:TaxAmount>/g, '<cbc:TaxAmount currencyID="PEN">99.12</cbc:TaxAmount>'), true);
    console.log(`>> igv: ${r}`);
    expect(r).not.toMatch(/^CDR 0: .*aceptada\s*$/);
  }, 60_000);
});

describe.skipIf(!enabled)('SUNAT beta: resumen diario y comunicación de baja', () => {
  const sol = { ruc: ISSUER.ruc, ...BETA_SOL };
  const client = new BillServiceClient();
  const compact = () => today().replace(/-/g, '');

  const waitTicket = async (ticket: string) => {
    for (let i = 0; i < 10; i++) {
      const s = await client.getStatus('beta', sol, ticket);
      if (s.statusCode !== '98') return s;
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error('El ticket sigue en proceso');
  };

  const boleta = (n: number, over: Record<string, unknown> = {}) =>
    buildSaleDocument(SaleDocumentSchema.parse({ documento: 'boleta', serie: 'B001', numero: n, fecha_de_emision: today(), ...DNI_CLIENT, items: [item()], ...over }), ISSUER, { number: n, today: today(), now: '10:00:00' });

  it('resumen diario: alta y anulación de boletas', async () => {
    const { summaryXml } = await import('../src/modules/sunat/ubl/summary-xml');
    const id = `RC-${compact()}-${(number() % 90000) + 1}`;
    const xml = summaryXml({
      id,
      referenceDate: today(),
      issueDate: today(),
      issuer: ISSUER,
      lines: [
        { action: '1', document: boleta(number() + 1) },
        { action: '3', document: boleta(number() + 2, { items: [item({ porcentaje_igv: '0', codigo_tipo_afectacion_igv: '20' })] }) },
        { action: '1', document: boleta(number() + 3, { descuentos: [{ monto: '10.00', codigo: '03' }] }) },
      ],
    });
    const name = `${ISSUER.ruc}-${id}`;
    const ticket = await client.sendSummary('beta', sol, `${name}.zip`, zipFile(`${name}.xml`, signXml(xml, testCertificate()).xml));
    const status = await waitTicket(ticket);
    const cdr = status.content ? parseCdrZip(status.content) : null;
    console.log(`>> RC ticket ${ticket}: status ${status.statusCode} ${cdr ? `CDR ${cdr.code}: ${cdr.description} ${cdr.notes.join(' | ')}` : ''}`);
    expect(status.statusCode).toBe('0');
    expect(cdr?.accepted).toBe(true);
  }, 90_000);

  it('comunicación de baja de una factura', async () => {
    const { voidedXml } = await import('../src/modules/sunat/ubl/summary-xml');
    const id = `RA-${compact()}-${(number() % 90000) + 1}`;
    const xml = voidedXml({ id, referenceDate: today(), issueDate: today(), issuer: ISSUER, lines: [{ type: '01', series: 'F001', number: 192, reason: 'ANULACIÓN DE OPERACIÓN' }] });
    const name = `${ISSUER.ruc}-${id}`;
    const ticket = await client.sendSummary('beta', sol, `${name}.zip`, zipFile(`${name}.xml`, signXml(xml, testCertificate()).xml));
    const status = await waitTicket(ticket);
    const cdr = status.content ? parseCdrZip(status.content) : null;
    console.log(`>> RA ticket ${ticket}: status ${status.statusCode} ${cdr ? `CDR ${cdr.code}: ${cdr.description} ${cdr.notes.join(' | ')}` : ''}`);
    expect(status.statusCode).toBe('0');
    expect(cdr?.accepted).toBe(true);
  }, 90_000);
});
