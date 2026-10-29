import { BadRequestException, ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/configuration';
import { PrismaService } from '../src/prisma/prisma.service';
import { CompaniesService } from '../src/modules/sunat/companies.service';
import { DocumentsService } from '../src/modules/sunat/documents.service';
import { DespatchSchema } from '../src/modules/sunat/dto/despatch.dto';
import { CompanySchema } from '../src/modules/sunat/dto/company.dto';
import { SaleDocumentSchema } from '../src/modules/sunat/dto/document.dto';
import { DailySummarySchema, VoidedSchema } from '../src/modules/sunat/dto/operations.dto';
import { SunatInputError } from '../src/modules/sunat/errors';
import { SecretBox } from '../src/modules/sunat/secret-box';
import { testCertificate } from '../src/modules/sunat/signing/test-certificate';
import { type BillServiceClient, SunatFault, SunatUnavailable } from '../src/modules/sunat/transport/bill-service';
import type { GreApiClient } from '../src/modules/sunat/transport/gre-api';
import { zipFile } from '../src/modules/sunat/transport/zip';

/**
 * Emisión, bajas, resúmenes y guías contra un Postgres real (TEST_DATABASE_URL,
 * nunca el de producción), con SUNAT simulado.
 */
const url = process.env.TEST_DATABASE_URL;

const cdrZip = (code: string, description: string, notes: string[] = []) =>
  Buffer.from(
    zipFile(
      'R-x.xml',
      `<ar:ApplicationResponse xmlns:ar="urn:a" xmlns:cbc="urn:b" xmlns:cac="urn:c">${notes.map((n) => `<cbc:Note>${n}</cbc:Note>`).join('')}` +
        `<cac:DocumentResponse><cac:Response><cbc:ResponseCode>${code}</cbc:ResponseCode><cbc:Description>${description}</cbc:Description></cac:Response></cac:DocumentResponse></ar:ApplicationResponse>`,
    ),
  );

describe.skipIf(!url)('SUNAT: documentos (Postgres)', () => {
  const config = { auth: { databaseUrl: url }, sunat: { secretsKey: 'una-llave-de-pruebas-de-mas-de-32-caracteres', timeoutMs: 1000 } } as unknown as AppConfig;
  const prisma = new PrismaService(config);
  const secrets = new SecretBox(config);
  const companies = new CompaniesService(prisma, secrets);
  const tag = `sn${Date.now()}`;
  let userId = '';

  // SUNAT simulado: cada llamada toma la siguiente respuesta programada.
  let sendBill: Array<() => Buffer> = [];
  let tickets: Array<() => { statusCode: string; content?: Buffer }> = [];
  let greStatus: Array<() => { code: string; cdr?: Buffer; error?: { code: string; message: string } }> = [];
  const calls = { sendBill: [] as string[], sendSummary: [] as string[], getStatus: [] as string[], getStatusCdr: 0, greSend: [] as string[] };
  const sunat = {
    sendBill: async (_e: string, sol: { user: string }, name: string) => {
      calls.sendBill.push(`${sol.user}:${name}`);
      return (sendBill.shift() ?? (() => cdrZip('0', 'aceptada')))();
    },
    sendSummary: async (_e: string, _s: unknown, name: string) => {
      calls.sendSummary.push(name);
      return `T-${calls.sendSummary.length}`;
    },
    getStatus: async (_e: string, _s: unknown, ticket: string) => {
      calls.getStatus.push(ticket);
      return (tickets.shift() ?? (() => ({ statusCode: '0', content: cdrZip('0', 'aceptado') })))();
    },
    getStatusCdr: async () => {
      calls.getStatusCdr++;
      return { statusCode: '0004', message: 'ok', content: cdrZip('0', 'recuperado') };
    },
  } as unknown as BillServiceClient;
  const gre = {
    send: async (_e: string, cred: { clientId: string }, name: string) => {
      calls.greSend.push(`${cred.clientId.slice(0, 5)}:${name}`);
      return 'G-1';
    },
    status: async () => (greStatus.shift() ?? (() => ({ code: '0', cdr: cdrZip('0', 'ACEPTADA') })))(),
  } as unknown as GreApiClient;
  const documents = new DocumentsService(prisma, companies, sunat, gre);

  const sale = (over: Record<string, unknown> = {}) =>
    SaleDocumentSchema.parse({ documento: 'factura', serie: 'F001', cliente_tipo_de_documento: '6', cliente_numero_de_documento: '20100070970', cliente_denominacion: 'CLIENTE SAC', items: [{ descripcion: 'Producto', cantidad: 1, valor_unitario: 100 }], ...over });
  const boleta = (over: Record<string, unknown> = {}) => sale({ documento: 'boleta', serie: 'B001', cliente_tipo_de_documento: '1', cliente_numero_de_documento: '75413811', ...over });
  const company = () => companies.get(userId, '20000000001');

  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `${tag}@test.local` } })).id;
    await companies.upsert(userId, CompanySchema.parse({ ruc: '20000000001', razon_social: 'EMPRESA DE PRUEBAS S.A.C.', direccion: 'AV. LOS OLIVOS 123', ubigeo: '150132' }));
  });

  beforeEach(() => {
    sendBill = [];
    tickets = [];
    greStatus = [];
    for (const k of ['sendBill', 'sendSummary', 'getStatus', 'greSend'] as const) calls[k].length = 0;
    calls.getStatusCdr = 0;
  });

  afterAll(async () => {
    const owned = await prisma.sunatCompany.findMany({ where: { userId }, select: { id: true } });
    await prisma.sunatDocument.deleteMany({ where: { companyId: { in: owned.map((c) => c.id) } } });
    await prisma.sunatCompany.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('una empresa nueva queda en beta, con el lugar tomado del ubigeo y sin exponer credenciales', async () => {
    const view = companies.view(await company());
    expect(view).toMatchObject({ ambiente: 'beta', departamento: 'LIMA', distrito: 'SAN JUAN DE LURIGANCHO', listo_para_produccion: false, tiene_sol_clave: false, certificado: null });
    expect(view.faltantes_para_produccion).toHaveLength(3);
    await expect(companies.upsert(userId, CompanySchema.parse({ ruc: '20000000001', ambiente: 'produccion' }))).rejects.toBeInstanceOf(SunatInputError);
  });

  it('emite con correlativo automático y guarda XML, CDR y hash', async () => {
    const a = await documents.emit(await company(), sale());
    const b = await documents.emit(await company(), sale());
    expect([a.number, b.number]).toEqual([1, 2]);
    expect(a).toMatchObject({ status: 'ACEPTADO', sunatCode: '0', environment: 'beta', currency: 'PEN', customerDoc: '20100070970' });
    expect(a.total?.toFixed(2)).toBe('118.00');
    expect(a.hash).toBeTruthy();
    expect(documents.signedXml(a)).toContain('<cbc:ID>F001-1</cbc:ID>');
    expect(documents.cdrXml(a)).toContain('aceptada');
    // En beta se usa el usuario de pruebas de SUNAT.
    expect(calls.sendBill[0]).toBe('MODDATOS:20000000001-01-F001-1.zip');

    const view = documents.view(a, '20000000001', 'https://api.test');
    expect(view).toMatchObject({ success: true, payload: { estado: 'ACEPTADO', serie: 'F001', numero: 1, ambiente: 'beta' } });
    expect(view.payload.xml).toBe(`https://api.test/v1/sunat/files/${a.token}/20000000001-01-F001-1.xml`);
    expect(view.payload.cdr).toBe(`https://api.test/v1/sunat/files/${a.token}/R-20000000001-01-F001-1.xml`);
    expect(view.payload.pdf).toEqual({ ticket: `https://api.test/v1/sunat/files/${a.token}/20000000001-01-F001-1-ticket.pdf`, a4: `https://api.test/v1/sunat/files/${a.token}/20000000001-01-F001-1.pdf` });
    expect((await documents.byToken(a.token)).id).toBe(a.id);
  });

  it('Idempotency-Key: el mismo pedido repetido devuelve el mismo comprobante sin volver a enviarlo', async () => {
    const c = await company();
    const dto = boleta({ serie: 'B091', items: [{ descripcion: 'Polo', cantidad: 2, precio_unitario: '59.90' }] });
    const first = await documents.emit(c, dto, { idempotencyKey: `${tag}-venta-1` });
    expect(first).toMatchObject({ status: 'ACEPTADO', number: 1 });
    expect(first.total?.toFixed(2)).toBe('119.80');
    const again = await documents.replay(c, `${tag}-venta-1`, dto);
    expect(again?.id).toBe(first.id);
    expect(calls.sendBill).toHaveLength(1);
    // La misma clave para otro comprobante es un error del cliente.
    await expect(documents.replay(c, `${tag}-venta-1`, { ...dto, serie: 'B092' })).rejects.toThrow(ConflictException);
  });

  it('Idempotency-Key: dos envíos a la vez con la misma clave dan un solo comprobante', async () => {
    const c = await company();
    const dto = boleta({ serie: 'B093' });
    const [a, b] = await Promise.all([documents.emit(c, dto, { idempotencyKey: `${tag}-doble` }), documents.emit(c, dto, { idempotencyKey: `${tag}-doble` })]);
    expect(a.id).toBe(b.id);
    expect([a.replayed, b.replayed].filter(Boolean)).toHaveLength(1);
    expect(calls.sendBill).toHaveLength(1);
    expect(await prisma.sunatDocument.count({ where: { companyId: c.id, series: 'B093' } })).toBe(1);
  });

  it('Idempotency-Key: si SUNAT lo rechazó, la misma clave vuelve a emitir con los datos corregidos', async () => {
    const c = await company();
    sendBill = [
      () => {
        throw new SunatFault('2017', 'El numero de documento de identidad del receptor debe ser RUC');
      },
    ];
    const rejected = await documents.emit(c, boleta({ serie: 'B094' }), { idempotencyKey: `${tag}-rechazo` });
    expect(rejected.status).toBe('RECHAZADO');
    expect(await documents.replay(c, `${tag}-rechazo`, boleta({ serie: 'B094' }))).toBeNull();
    const fixed = await documents.emit(c, boleta({ serie: 'B094' }), { idempotencyKey: `${tag}-rechazo` });
    expect(fixed).toMatchObject({ status: 'ACEPTADO', number: 1 });
    expect(fixed.replayed).toBeUndefined();
  });

  it('no repite un número ya emitido', async () => {
    await expect(documents.emit(await company(), sale({ numero: 1 }))).rejects.toThrow(BadRequestException);
    await expect(documents.emit(await company(), sale({ numero: 1 }))).rejects.toThrow('ERROR: factura F001-1 fue emitido anteriormente.');
  });

  it('un número rechazado por SUNAT se puede volver a usar', async () => {
    sendBill = [
      () => {
        throw new SunatFault('2017', 'El numero de documento de identidad del receptor debe ser RUC');
      },
    ];
    const rejected = await documents.emit(await company(), sale({ numero: 50 }));
    expect(rejected).toMatchObject({ status: 'RECHAZADO', sunatCode: '2017', cdr: null });
    expect(documents.view(rejected, '20000000001', 'x').message).toContain('debe ser RUC');
    const again = await documents.emit(await company(), sale({ numero: 50 }));
    expect(again).toMatchObject({ id: rejected.id, status: 'ACEPTADO', sunatCode: '0' });
  });

  it('un CDR con código 2xxx es rechazo; con observaciones 4xxx, aceptado', async () => {
    sendBill = [() => cdrZip('2800', 'El dato ingresado en el tipo de documento de identidad del receptor no esta permitido'), () => cdrZip('0', 'aceptada', ['4287 - El precio unitario difiere'])];
    expect(await documents.emit(await company(), sale({ numero: 60 }))).toMatchObject({ status: 'RECHAZADO', sunatCode: '2800' });
    const observed = await documents.emit(await company(), sale({ numero: 61 }));
    expect(observed).toMatchObject({ status: 'ACEPTADO', observations: ['4287 - El precio unitario difiere'] });
    expect(documents.view(observed, '20000000001', 'x').message).toBe('El comprobante fue aceptado por SUNAT con observaciones.');
  });

  it('si SUNAT no responde queda PENDIENTE y el worker lo reenvía', async () => {
    sendBill = [
      () => {
        throw new SunatUnavailable('SUNAT no respondió en 30 s');
      },
    ];
    const pending = await documents.emit(await company(), sale({ numero: 70 }));
    expect(pending).toMatchObject({ status: 'PENDIENTE', attempts: 1 });
    expect(pending.nextCheckAt).toBeInstanceOf(Date);
    expect(documents.view(pending, '20000000001', 'x').payload).toMatchObject({ estado: 'PENDIENTE', cdr: null });

    // Todavía no le toca.
    expect(await documents.pollDue()).toEqual({ checked: 0, resolved: 0 });
    await prisma.sunatDocument.update({ where: { id: pending.id }, data: { nextCheckAt: new Date(Date.now() - 1000) } });
    expect(await documents.pollDue()).toEqual({ checked: 1, resolved: 1 });
    expect(await documents.status(await company(), { documento: 'factura', serie: 'F001', numero: 70 })).toMatchObject({ status: 'ACEPTADO', attempts: 2 });
    expect(calls.sendBill).toHaveLength(2);
    expect(calls.getStatusCdr).toBe(0); // la consulta de CDR solo existe en producción
  });

  it('una falla pasajera de SUNAT (0109) también deja el comprobante pendiente', async () => {
    sendBill = [
      () => {
        throw new SunatFault('0109', 'El sistema no puede responder su solicitud');
      },
    ];
    expect(await documents.emit(await company(), sale({ numero: 71 }))).toMatchObject({ status: 'PENDIENTE', sunatCode: '0109' });
    // Consultar el estado lo reintenta en el momento.
    expect(await documents.status(await company(), { documento: 'factura', serie: 'F001', numero: 71 })).toMatchObject({ status: 'ACEPTADO' });
  });

  it('comunicación de baja: anula la factura cuando SUNAT acepta el ticket', async () => {
    const co = await company();
    const invoice = await documents.emit(co, sale({ numero: 80 }));
    const ra = await documents.void(co, VoidedSchema.parse({ motivo: 'ERROR EN EL MONTO', documento_afectado: { documento: 'factura', serie: 'F001', numero: '80' } }));
    expect(ra).toMatchObject({ type: 'RA', status: 'ACEPTADO', ticket: 'T-1', number: 1 });
    expect(ra.series).toMatch(/^RA-\d{8}$/);
    expect(calls.sendSummary[0]).toBe(`20000000001-${ra.series}-1.zip`);
    expect(documents.signedXml(ra)).toContain('<sac:DocumentNumberID>80</sac:DocumentNumberID><sac:VoidReasonDescription>ERROR EN EL MONTO</sac:VoidReasonDescription>');
    expect(await prisma.sunatDocument.findUnique({ where: { id: invoice.id } })).toMatchObject({ status: 'ANULADO', voidedById: ra.id });
    expect(documents.view(ra, '20000000001', 'x').payload).not.toHaveProperty('pdf');

    await expect(documents.void(co, VoidedSchema.parse({ documento_afectado: { documento: 'factura', serie: 'F001', numero: 80 } }))).rejects.toThrow('ya fue dada de baja');
    await expect(documents.void(co, VoidedSchema.parse({ documento_afectado: { documento: 'factura', serie: 'F001', numero: 9999 } }))).rejects.toThrow('no se encuentra registrado');
  });

  it('una baja en proceso queda PENDIENTE y se resuelve al consultar', async () => {
    const co = await company();
    const invoice = await documents.emit(co, sale({ numero: 81 }));
    tickets = [() => ({ statusCode: '98' }), () => ({ statusCode: '98' }), () => ({ statusCode: '98' }), () => ({ statusCode: '98' }), () => ({ statusCode: '99', content: cdrZip('2105', 'No existe el comprobante') })];
    const ra = await documents.void(co, VoidedSchema.parse({ documento_afectado: { documento: 'factura', serie: 'F001', numero: 81 } }));
    expect(ra).toMatchObject({ status: 'PENDIENTE' });
    expect(await prisma.sunatDocument.findUnique({ where: { id: invoice.id } })).toMatchObject({ status: 'ACEPTADO' });
    const done = await documents.status(co, { documento: 'comunicacion_baja', serie: ra.series, numero: ra.number });
    expect(done).toMatchObject({ status: 'RECHAZADO', sunatCode: '2105' });
    // Rechazada la baja, la factura sigue vigente.
    expect(await prisma.sunatDocument.findUnique({ where: { id: invoice.id } })).toMatchObject({ status: 'ACEPTADO', voidedById: null });
  }, 20_000);

  it('resumen diario: informa boletas retenidas y anula las aceptadas', async () => {
    const co = await company();
    const held = await documents.emit(co, boleta(), { hold: true });
    expect(held).toMatchObject({ status: 'PENDIENTE', attempts: 0, number: 1 });
    expect(calls.sendBill).toHaveLength(0);
    const sent = await documents.emit(co, boleta());
    expect(sent).toMatchObject({ status: 'ACEPTADO', number: 2 });

    const rc = await documents.dailySummary(co, DailySummarySchema.parse({ documentos_afectados: [{ documento: 'boleta', serie: 'B001', numero: 1, accion_resumen: 'adicionar' }, { documento: 'boleta', serie: 'B001', numero: 2, accion_resumen: 'anular' }] }));
    expect(rc).toMatchObject({ type: 'RC', status: 'ACEPTADO' });
    const xml = documents.signedXml(rc);
    expect(xml).toContain('<cbc:ID>B001-1</cbc:ID>');
    expect(xml).toContain('<cbc:ConditionCode>1</cbc:ConditionCode>');
    expect(xml).toContain('<cbc:ConditionCode>3</cbc:ConditionCode>');
    expect(await prisma.sunatDocument.findUnique({ where: { id: held.id } })).toMatchObject({ status: 'ACEPTADO' });
    expect(await prisma.sunatDocument.findUnique({ where: { id: sent.id } })).toMatchObject({ status: 'ANULADO', voidedById: rc.id });

    // Una boleta que llega a /voided se anula con un resumen diario.
    const viaVoided = await documents.void(co, VoidedSchema.parse({ documento_afectado: { documento: 'boleta', serie: 'B001', numero: 1 } }));
    expect(viaVoided.type).toBe('RC');
    await expect(documents.void(co, VoidedSchema.parse({ documentos_afectados: [{ documento: 'boleta', serie: 'B001', numero: 1 }, { documento: 'factura', serie: 'F001', numero: 2 }] }))).rejects.toBeInstanceOf(SunatInputError);
  });

  it('guía de remisión: en beta usa las credenciales del entorno de pruebas', async () => {
    const co = await company();
    const dto = DespatchSchema.parse({
      documento: 'guia_remision_remitente', serie: 'T001', motivo_de_traslado: '01', modalidad_de_transporte: '02', fecha_inicio_de_traslado: '2026-10-12',
      destinatario_tipo_de_documento: '6', destinatario_numero_de_documento: '20609286696', destinatario_denominacion: 'DESTINO SAC',
      punto_de_partida_ubigeo: '150132', punto_de_partida_direccion: 'A', punto_de_llegada_ubigeo: '150122', punto_de_llegada_direccion: 'B', peso_bruto_total: '1.9',
      items: [{ descripcion: 'DISCO', cantidad: 1 }], vehiculos: [{ numero_de_placa: 'F6Y931' }], conductores: [{ numero_de_documento: '47101979', nombres: 'JUAN', apellidos: 'GONZALES', numero_licencia_conducir: 'Q43101919' }],
    });
    const guide = await documents.emitDespatch(co, dto);
    expect(guide).toMatchObject({ type: '09', status: 'ACEPTADO', ticket: 'G-1', number: 1, customerDoc: '20609286696' });
    expect(calls.greSend[0]).toBe('test-:20000000001-09-T001-1');
    expect(documents.view(guide, '20000000001', 'https://api.test').payload.pdf).toEqual({ a4: `https://api.test/v1/sunat/files/${guide.token}/20000000001-09-T001-1.pdf` });

    greStatus = [() => ({ code: '99', error: { code: '3381', message: 'Documento relacionado inválido' } })];
    expect(await documents.emitDespatch(co, dto)).toMatchObject({ status: 'RECHAZADO', sunatCode: '3381', sunatMessage: 'Documento relacionado inválido', number: 2 });
  });

  it('producción: exige credenciales, usa el SOL de la empresa y recupera el CDR de un pendiente', async () => {
    const cert = testCertificate();
    const co = await companies.upsert(
      userId,
      CompanySchema.parse({ ruc: '20100070970', razon_social: 'OTRA EMPRESA S.A.', direccion: 'CAL. MORELLI 181', sol_usuario: 'factura1', sol_clave: 'clave-secreta', certificado: `${cert.privateKeyPem}\n${cert.certificatePem}`, ambiente: 'produccion' }),
    );
    expect(co.solPassword).not.toContain('clave-secreta');
    expect(co.certificate).not.toContain('PRIVATE KEY');
    expect(companies.view(co)).toMatchObject({ ambiente: 'produccion', sol_usuario: 'FACTURA1', tiene_sol_clave: true, listo_para_produccion: true });
    expect(JSON.stringify(companies.view(co))).not.toContain('clave-secreta');
    // Con dos empresas hay que decir cuál.
    await expect(companies.resolve(userId)).rejects.toBeInstanceOf(SunatInputError);
    expect((await companies.resolve(userId, '20100070970')).id).toBe(co.id);

    sendBill = [
      () => {
        throw new SunatUnavailable('timeout');
      },
    ];
    const pending = await documents.emit(co, sale({ cliente_numero_de_documento: '20131312955' }));
    expect(calls.sendBill[0]).toBe('FACTURA1:20100070970-01-F001-1.zip');
    expect(pending).toMatchObject({ status: 'PENDIENTE', environment: 'produccion' });
    // En producción, antes de reenviar, se le pide a SUNAT el CDR del comprobante.
    const done = await documents.refresh({ ...pending, company: co });
    expect(done).toMatchObject({ status: 'ACEPTADO', sunatMessage: 'recuperado' });
    expect(calls.getStatusCdr).toBe(1);
    expect(calls.sendBill).toHaveLength(1);

    // Las guías de producción piden las credenciales de API de la empresa.
    const guide = DespatchSchema.parse({
      documento: 'guia_remision_remitente', serie: 'T001', motivo_de_traslado: '01', modalidad_de_transporte: '02', fecha_inicio_de_traslado: '2026-10-12', indicador_vehiculo_m1_l: true,
      destinatario_tipo_de_documento: '6', destinatario_numero_de_documento: '20609286696', destinatario_denominacion: 'DESTINO SAC',
      punto_de_partida_ubigeo: '150132', punto_de_partida_direccion: 'A', punto_de_llegada_ubigeo: '150122', punto_de_llegada_direccion: 'B', peso_bruto_total: '1.9', items: [{ descripcion: 'DISCO', cantidad: 1 }],
    });
    await expect(documents.emitDespatch(co, guide)).rejects.toThrow(/api_client_id/);

    // No se borra una empresa con comprobantes de producción.
    await expect(companies.remove(userId, '20100070970')).rejects.toThrow(/comprobantes de producción/);
  });
});
