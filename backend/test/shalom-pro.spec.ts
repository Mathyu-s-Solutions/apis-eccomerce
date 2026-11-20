import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { SecretBox } from '../src/common/crypto/secret-box';
import type { AppConfig } from '../src/config/configuration';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ShalomShipmentSchema, type ShalomShipmentDto } from '../src/modules/shalom/dto/shalom-pro.dto';
import { guideKey, ShalomGuideCache } from '../src/modules/shalom/shalom-guide-cache';
import { CookieJar, type ShalomProClient, ShalomProSessionExpired } from '../src/modules/shalom/pro/shalom-pro.client';
import { buildServiceOrder, generateSecurityCode, senderOf, ShalomProService } from '../src/modules/shalom/pro/shalom-pro.service';

const shipment = (over: Record<string, unknown> = {}): ShalomShipmentDto =>
  ShalomShipmentSchema.parse({
    origin: '220',
    destination: '7',
    package: 'xs',
    recipient: { document: '12345678', name: 'MARIA', paternalSurname: 'PEREZ', maternalSurname: 'GOMEZ', phone: '987654321' },
    ...over,
  });

describe('CookieJar', () => {
  it('guarda, reemplaza y borra cookies según Set-Cookie', () => {
    const jar = new CookieJar();
    jar.update([
      'XSRF-TOKEN=abc%3D; expires=Fri, 20 Nov 2099 04:47:52 GMT; Max-Age=3600; path=/; secure; samesite=lax',
      'enviashalom_session=s1; Max-Age=3600; path=/; httponly',
    ]);
    expect(jar.header()).toBe('XSRF-TOKEN=abc%3D; enviashalom_session=s1');
    jar.update(['enviashalom_session=s2; path=/', 'XSRF-TOKEN=deleted; Max-Age=0']);
    expect(jar.toJSON()).toEqual({ enviashalom_session: 's2' });
    expect(new CookieJar(jar.toJSON()).get('enviashalom_session')).toBe('s2');
  });
});

describe('ShalomShipmentSchema', () => {
  const errors = (over: Record<string, unknown>) => {
    const r = ShalomShipmentSchema.safeParse({ ...shipment(), ...over });
    return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
  };

  it('pone valores por defecto', () => {
    const dto = shipment();
    expect(dto.quantity).toBe(1);
    expect(dto.payer).toBe('sender');
  });

  it('pide peso o medidas para otra medida', () => {
    expect(errors({ package: 'custom' })).toContain('weightKg');
    expect(errors({ package: 'custom', weightKg: 3 })).toEqual([]);
    expect(errors({ package: 'custom', lengthCm: 30, widthCm: 20, heightCm: 10 })).toEqual([]);
  });

  it('pide apellidos salvo para RUC', () => {
    const recipient = { document: '12345678', name: 'MARIA', phone: '987654321' };
    expect(errors({ recipient })).toEqual(['recipient.paternalSurname', 'recipient.maternalSurname']);
    expect(errors({ recipient: { ...recipient, document: '20123456789', name: 'MI EMPRESA SAC' } })).toEqual([]);
    expect(errors({ recipient: { ...recipient, document: '30123456789' } })).toContain('recipient.document');
  });

  it('rechaza claves débiles y la declaración sin guías de remisión', () => {
    expect(errors({ securityCode: '1234' })).toEqual(['securityCode']);
    expect(errors({ securityCode: '7777' })).toEqual(['securityCode']);
    expect(errors({ securityCode: '4821' })).toEqual([]);
    expect(errors({ declaration: 'clothes' })).toEqual(['declaration']);
    expect(errors({ declaration: 'clothes', referralGuides: [{ series: 'T001', number: '45' }] })).toEqual([]);
    expect(errors({ destination: '220' })).toEqual(['destination']);
  });

  it('genera claves válidas', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateSecurityCode();
      expect(code).toMatch(/^\d{4}$/);
      expect(ShalomShipmentSchema.safeParse({ ...shipment(), securityCode: code }).success).toBe(true);
    }
  });
});

describe('senderOf', () => {
  it('lee persona o empresa del perfil', () => {
    expect(senderOf({ success: true, message: '', data: { person: { document: '44556677', name: 'JUAN', last_name: 'RAMOS', sur_name: 'DIAZ', phone: '912345678' } } })).toMatchObject({
      document: '44556677',
      documentType: 'DNI',
      name: 'JUAN',
      paternalSurname: 'RAMOS',
      maternalSurname: 'DIAZ',
      phone: '912345678',
    });
    expect(senderOf({ data: { company: { number_document: '20123456789', legal_name: 'TIENDA SAC' }, phone: '999888777' } })).toMatchObject({
      documentType: 'RUC',
      name: 'TIENDA SAC',
      paternalSurname: '',
      phone: '999888777',
    });
    expect(senderOf({ data: {} })).toBeNull();
  });
});

describe('buildServiceOrder', () => {
  const base = {
    origin: { ter_id: 220 },
    destination: { ter_id: 7 },
    product: { id: 5, title: 'Caja Paquete XS', content: 'Hasta 2 kg' },
    price: 12,
    sender: { document: '44556677', documentType: 'DNI' as const, name: 'JUAN', paternalSurname: 'RAMOS', maternalSurname: 'DIAZ', phone: '912345678', email: null },
    recipientUuid: 'uuid-1',
    securityCode: '4821',
  };

  it('arma el cuerpo del formulario "Envía ya"', () => {
    const body = buildServiceOrder({ ...base, dto: shipment({ referralGuides: [{ series: 'T001', number: '45' }] }) });
    expect(body).toMatchObject({
      origen: 220,
      destino: 7,
      tipo_pago: 'REMITENTE',
      tipo_producto: 5,
      tipo_producto_json: { value: 12, name: 'Caja Paquete XS', detalle: 'Hasta 2 kg' },
      cantidad: 1,
      peso: '',
      costo: 12,
      destinatario_uuid: 'uuid-1',
      remitente_nombre: 'JUAN',
      remitente_apellido_paterno: 'RAMOS',
      clave: '4821',
      aereo: 0,
      grrs: '[{"guide":"45","series":"T001"}]',
      declaracion_jurada: '',
    });
  });

  it('marca el destino aéreo con 0 y manda las medidas de otra medida', () => {
    const body = buildServiceOrder({ ...base, dto: shipment({ air: true, payer: 'recipient', package: 'custom', weightKg: 3, lengthCm: 30, widthCm: 20, heightCm: 10 }) });
    expect(body).toMatchObject({ destino: '07', aereo: 1, tipo_pago: 'DESTINATARIO', peso: 3, largo: 30, ancho: 20, alto: 10 });
  });
});

/** Shalom Pro simulado: rutas de /api/v1 y conteo de logins. */
function fakePro(opts: { recipientExists?: boolean; expireFirst?: string } = {}) {
  const calls: Array<{ path: string; body: unknown }> = [];
  let logins = 0;
  let expire = opts.expireFirst;
  const routes: Record<string, (body: any) => unknown> = {
    '/auth/me': () => ({ success: true, message: 'ok', data: { person: { document: '44556677', name: 'JUAN', last_name: 'RAMOS', sur_name: 'DIAZ', phone: '912345678' } } }),
    '/envia_ya/terminals': () => ({
      Map: [
        { ter_id: 220, lugar_over: 'Malvinas', origen: 1, destino: 1, ter_habilitado_OS: 1, ter_aereo: 1 },
        { ter_id: 7, lugar_over: 'Av Parra 379', origen: 1, destino: 1, ter_habilitado_OS: 1, ter_aereo: 1, origenes_aereos: [220] },
        { ter_id: 9, lugar_over: 'Solo recibe', origen: 0, destino: 1, ter_habilitado_OS: 1, ter_aereo: 0 },
      ],
    }),
    '/envia_ya/products': () => ({ success: true, data: [{ id: 3, title: 'Sobre' }, { id: 5, title: 'Caja Paquete XS', content: 'Hasta 2 kg' }, { id: 9, title: 'Otra Medida' }] }),
    '/envia_ya/tariff/calculate': (b) => ({ success: true, data: { tariff: { sobre: 8, cajapaquetexs: String(b.destiny).startsWith('0') ? 25 : 12 }, price: 30, message: '' } }),
    '/service-orders/recipients/search': () => (opts.recipientExists ? { success: true, message: '', data: { uuid: 'uuid-old' } } : { success: false, message: 'No encontrado', data: null }),
    '/service-orders/recipients/save': () => ({ success: true, message: '', data: { uuid: 'uuid-new' } }),
    '/envia_ya/service_order/save': () => ({ success: true, data: { guia: '87654321', serie: 'B001', codigo: 'XK29', ose_id: 999001, precio: '12.00' } }),
    '/rotulo/token': () => ({ url: 'https://pro.shalom.pe/storage/rotulo-999001.pdf' }),
    '/ticket-pdf/token': () => ({ success: true, message: '', data: { token: 'tk' } }),
  };
  const respond = (path: string, body: unknown) => {
    calls.push({ path, body });
    if (expire === path) {
      expire = undefined;
      throw new ShalomProSessionExpired();
    }
    const route = routes[path];
    if (!route) throw new Error(`ruta inesperada ${path}`);
    return route(body);
  };
  const client = {
    login: async () => {
      logins++;
      return new CookieJar({ enviashalom_session: `s${logins}`, 'XSRF-TOKEN': 'x' });
    },
    call: async (_jar: CookieJar, _m: string, path: string, body?: unknown) => respond(path, body),
    request: async (_jar: CookieJar, _m: string, path: string, body?: unknown) => {
      const res = respond(path, body) as { success?: boolean };
      return { status: res.success === false ? 404 : 200, body: res };
    },
    download: async (_jar: CookieJar, url: string) => {
      calls.push({ path: 'download', body: url });
      return { data: Buffer.from('%PDF-1.4'), contentType: 'application/pdf' };
    },
  } as unknown as ShalomProClient;

  const rows = new Map<string, any>();
  const shipments = new Map<string, any>();
  const prisma = {
    enabled: true,
    shalomProShipment: {
      upsert: async ({ where, create }: any) => {
        shipments.set(where.oseId, create);
        return create;
      },
      findUnique: async ({ where }: any) => shipments.get(where.oseId) ?? null,
    },
    shalomProAccount: {
      findUnique: async ({ where }: any) => rows.get(where.userId) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const now = new Date();
        const row = rows.has(where.userId) ? { ...rows.get(where.userId), ...update, updatedAt: now } : { ...create, createdAt: now, updatedAt: now };
        rows.set(where.userId, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = { ...rows.get(where.userId), ...data };
        rows.set(where.userId, row);
        return row;
      },
      delete: async ({ where }: any) => rows.delete(where.userId),
    },
  } as unknown as PrismaService;
  const secrets = new SecretBox({ sunat: { secretsKey: 'k'.repeat(32) } } as unknown as AppConfig);
  const guides = new ShalomGuideCache({ enabled: false } as unknown as PrismaService);
  const service = new ShalomProService(client, prisma, secrets, guides);
  return { service, calls, rows, secrets, guides, logins: () => logins, paths: () => calls.map((c) => c.path) };
}

describe('ShalomProService', () => {
  it('conecta la cuenta: guarda la contraseña y la sesión cifradas', async () => {
    const pro = fakePro();
    const view = await pro.service.connect('user-1', { email: 'ventas@tienda.pe', password: 'secreta' });
    expect(view).toMatchObject({ email: 'ventas@tienda.pe', sender: { document: '44556677', name: 'JUAN' } });
    const row = pro.rows.get('user-1');
    expect(row.password).not.toContain('secreta');
    expect(pro.secrets.open(row.password)).toBe('secreta');
    expect(JSON.parse(pro.secrets.open(row.session))).toEqual({ enviashalom_session: 's1', 'XSRF-TOKEN': 'x' });
    expect(view).not.toHaveProperty('password');
  });

  it('pide conectar la cuenta antes de crear guías', async () => {
    await expect(fakePro().service.createShipment('nadie', shipment())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea la guía con un destinatario nuevo y la deja lista para rastrear sin captcha', async () => {
    const pro = fakePro();
    await pro.service.connect('user-1', { email: 'ventas@tienda.pe', password: 'secreta' });
    const result = await pro.service.createShipment('user-1', shipment({ securityCode: '4821' }));
    expect(result).toMatchObject({
      orderNumber: '87654321',
      series: 'B001',
      orderCode: 'XK29',
      securityCode: '4821',
      oseId: '999001',
      price: 12,
      service: 'ground',
      origin: { code: '220', name: 'MALVINAS' },
      destination: { code: '7', name: 'AV PARRA 379' },
      recipient: { document: '12345678', alreadyRegistered: false },
      label: '/v1/shalom/shipments/999001/label',
    });
    const save = pro.calls.find((c) => c.path === '/envia_ya/service_order/save')?.body as Record<string, unknown>;
    expect(save).toMatchObject({ origen: 220, destino: 7, tipo_producto: 5, costo: 12, destinatario_uuid: 'uuid-new', clave: '4821', remitente_telefono: '912345678' });
    expect(pro.calls.find((c) => c.path === '/service-orders/recipients/save')?.body).toEqual({
      document: '12345678',
      first_name: 'MARIA',
      last_name: 'PEREZ',
      surname: 'GOMEZ',
      email: '',
      phone: '987654321',
    });
    expect(await pro.guides.find(await guideKey('87654321', 'XK29'))).toEqual({ oseId: '999001', transitTime: null });
    expect(pro.logins()).toBe(1);
  });

  it('usa el destinatario que Shalom ya tiene y el celular del remitente que se mande', async () => {
    const pro = fakePro({ recipientExists: true });
    await pro.service.connect('user-1', { email: 'a@b.pe', password: 'x' });
    const result = await pro.service.createShipment('user-1', shipment({ senderPhone: '955555555', air: true }));
    expect(result.recipient.alreadyRegistered).toBe(true);
    expect(pro.paths()).not.toContain('/service-orders/recipients/save');
    const save = pro.calls.find((c) => c.path === '/envia_ya/service_order/save')?.body as Record<string, unknown>;
    expect(save).toMatchObject({ destinatario_uuid: 'uuid-old', remitente_telefono: '955555555', destino: '07', aereo: 1, costo: 25 });
    expect(result.securityCode).toMatch(/^\d{4}$/);
  });

  it('si la sesión venció, entra de nuevo y reintenta una vez', async () => {
    const pro = fakePro({ expireFirst: '/envia_ya/terminals' });
    await pro.service.connect('user-1', { email: 'a@b.pe', password: 'x' });
    const result = await pro.service.createShipment('user-1', shipment());
    expect(result.oseId).toBe('999001');
    expect(pro.logins()).toBe(2);
    expect(JSON.parse(pro.secrets.open(pro.rows.get('user-1').session))).toMatchObject({ enviashalom_session: 's2' });
  });

  it('valida la ruta con las agencias de Shalom Pro antes de registrar', async () => {
    const pro = fakePro();
    await pro.service.connect('user-1', { email: 'a@b.pe', password: 'x' });
    await expect(pro.service.createShipment('user-1', shipment({ origin: '9' }))).rejects.toThrow(/no despacha/);
    await expect(pro.service.createShipment('user-1', shipment({ destination: '9', air: true }))).rejects.toThrow(/no recibe envíos aéreos/);
    await expect(pro.service.createShipment('user-1', shipment({ destination: '404' }))).rejects.toBeInstanceOf(BadRequestException);
    expect(pro.paths()).not.toContain('/envia_ya/service_order/save');
  });

  it('entrega rótulo y ticket solo de las guías que ese cliente creó', async () => {
    const pro = fakePro();
    await pro.service.connect('user-1', { email: 'a@b.pe', password: 'x' });
    await pro.service.connect('user-2', { email: 'c@d.pe', password: 'y' });
    const { oseId } = await pro.service.createShipment('user-1', shipment());
    expect((await pro.service.document('user-1', oseId, 'label')).contentType).toBe('application/pdf');
    await pro.service.document('user-1', oseId, 'ticket');
    expect(pro.calls.filter((c) => c.path === 'download').map((c) => c.body)).toEqual([
      'https://pro.shalom.pe/storage/rotulo-999001.pdf',
      '/api/v1/ticket-pdf/999001?token=tk&inline=1',
    ]);
    expect(pro.calls.find((c) => c.path === '/rotulo/token')?.body).toEqual({ ose_id: 999001 });
    await expect(pro.service.document('user-2', oseId, 'label')).rejects.toBeInstanceOf(NotFoundException);
    await expect(pro.service.document('user-1', '999002', 'label')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desconecta la cuenta', async () => {
    const pro = fakePro();
    await pro.service.connect('user-1', { email: 'a@b.pe', password: 'x' });
    await pro.service.disconnect('user-1');
    expect(pro.rows.has('user-1')).toBe(false);
    await expect(pro.service.account('user-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
