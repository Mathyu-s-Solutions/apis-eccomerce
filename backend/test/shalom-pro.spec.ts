import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { SecretBox } from '../src/common/crypto/secret-box';
import type { ApiKeyRecord } from '../src/auth/api-key.store';
import type { AppConfig } from '../src/config/configuration';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ShalomShipmentSchema, type ShalomShipmentDto } from '../src/modules/shalom/dto/shalom-pro.dto';
import { guideKey, ShalomGuideCache } from '../src/modules/shalom/shalom-guide-cache';
import { CookieJar, type ShalomProClient, ShalomProSessionExpired } from '../src/modules/shalom/pro/shalom-pro.client';
import {
  buildServiceOrder,
  generateSecurityCode,
  PRO_ACCOUNTS_LIMIT,
  proAccountsLimit,
  senderOf,
  ShalomProService,
} from '../src/modules/shalom/pro/shalom-pro.service';

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

  it('acepta el identificador de la cuenta (id del negocio) y rechaza otros caracteres', () => {
    expect(errors({ account: 'tienda-2' })).toEqual([]);
    expect(errors({ account: 'a1b2.c3_D4' })).toEqual([]);
    expect(errors({ account: 'a/b' })).toEqual(['account']);
    expect(errors({ account: '-x' })).toEqual(['account']);
    expect(errors({ account: 'x'.repeat(65) })).toEqual(['account']);
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
  const calls: Array<{ path: string; body: unknown; session?: string }> = [];
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
  const respond = (path: string, body: unknown, jar?: CookieJar) => {
    calls.push({ path, body, session: jar?.get('enviashalom_session') });
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
    call: async (jar: CookieJar, _m: string, path: string, body?: unknown) => respond(path, body, jar),
    request: async (jar: CookieJar, _m: string, path: string, body?: unknown) => {
      const res = respond(path, body, jar) as { success?: boolean };
      return { status: res.success === false ? 404 : 200, body: res };
    },
    download: async (jar: CookieJar, url: string) => {
      calls.push({ path: 'download', body: url, session: jar.get('enviashalom_session') });
      return { data: Buffer.from('%PDF-1.4'), contentType: 'application/pdf' };
    },
  } as unknown as ShalomProClient;

  // Cuentas por `${userId}/${ref}`, como la llave (user_id, ref) de la tabla.
  const rows = new Map<string, any>();
  const shipments = new Map<string, any>();
  let seq = 0;
  const id = (where: any) => `${where.userId_ref.userId}/${where.userId_ref.ref}`;
  const ofUser = (userId: string) => [...rows.values()].filter((r) => r.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
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
      findUnique: async ({ where }: any) => rows.get(id(where)) ?? null,
      findFirst: async ({ where }: any) => ofUser(where.userId)[0] ?? null,
      findMany: async ({ where, take }: any) => ofUser(where.userId).slice(0, take),
      count: async ({ where }: any) => ofUser(where.userId).length,
      upsert: async ({ where, create, update }: any) => {
        const now = new Date(Date.UTC(2026, 10, 20) + seq++);
        const row = rows.has(id(where)) ? { ...rows.get(id(where)), ...update, updatedAt: now } : { ...create, createdAt: now, updatedAt: now };
        rows.set(id(where), row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = { ...rows.get(id(where)), ...data };
        rows.set(id(where), row);
        return row;
      },
      delete: async ({ where }: any) => rows.delete(id(where)),
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
    const row = pro.rows.get('user-1/default');
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
      account: 'default',
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
    expect(JSON.parse(pro.secrets.open(pro.rows.get('user-1/default').session))).toMatchObject({ enviashalom_session: 's2' });
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
    expect(pro.rows.has('user-1/default')).toBe(false);
    await expect(pro.service.account('user-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('con un plan sin varias cuentas: reconecta la misma cuenta, pero no conecta otra', async () => {
    const pro = fakePro();
    await pro.service.connect('user-1', { email: 'a@b.pe', password: 'x' });
    await pro.service.connect('user-1', { email: 'otra@b.pe', password: 'y' });
    expect(pro.rows.get('user-1/default').email).toBe('otra@b.pe');
    await expect(pro.service.connect('user-1', { email: 'c@d.pe', password: 'z' }, 'tienda-2', PRO_ACCOUNTS_LIMIT.base)).rejects.toThrow(/planes Plataforma \(hasta 20\) y Empresarial/);
    // Se rechaza antes de entrar a Shalom (sin captcha).
    expect(pro.logins()).toBe(2);
  });

  it('con varias cuentas crea cada guía con la que se indica y pide sus PDFs con la misma', async () => {
    const pro = fakePro();
    const limit = PRO_ACCOUNTS_LIMIT.empresarial;
    await pro.service.connect('user-1', { email: 'a@b.pe', password: 'x' }, 'tienda-a', limit);
    await pro.service.connect('user-1', { email: 'b@b.pe', password: 'y' }, 'tienda-b', limit);
    expect((await pro.service.accounts('user-1')).map((a) => [a.account, a.email])).toEqual([
      ['tienda-a', 'a@b.pe'],
      ['tienda-b', 'b@b.pe'],
    ]);

    await expect(pro.service.createShipment('user-1', shipment(), limit)).rejects.toThrow(/indica con cuál.*tienda-a, tienda-b/);
    await expect(pro.service.createShipment('user-1', shipment({ account: 'tienda-c' }), limit)).rejects.toBeInstanceOf(NotFoundException);

    const b = await pro.service.createShipment('user-1', shipment({ account: 'tienda-b' }), limit);
    expect(b.account).toBe('tienda-b');
    expect(pro.calls.find((c) => c.path === '/envia_ya/service_order/save')?.session).toBe('s2');

    pro.calls.length = 0;
    await pro.service.document('user-1', b.oseId, 'label');
    expect(pro.calls.find((c) => c.path === '/rotulo/token')?.session).toBe('s2');
    expect(pro.logins()).toBe(2);

    // Si se desconecta la cuenta de la guía, sus PDFs piden reconectarla (no usan otra cuenta).
    await pro.service.disconnect('user-1', 'tienda-b');
    await expect(pro.service.document('user-1', b.oseId, 'ticket')).rejects.toThrow(/tienda-b.*PUT \/v1\/shalom\/pro\/accounts\/tienda-b/);
    // Con una sola cuenta conectada ya no hace falta `account`.
    expect((await pro.service.createShipment('user-1', shipment(), limit)).account).toBe('tienda-a');
  });

  it('sin un plan con varias cuentas no crea guías si quedaron varias conectadas', async () => {
    const pro = fakePro();
    await pro.service.connect('user-1', { email: 'a@b.pe', password: 'x' }, 'tienda-a', PRO_ACCOUNTS_LIMIT.empresarial);
    await pro.service.connect('user-1', { email: 'b@b.pe', password: 'y' }, 'tienda-b', PRO_ACCOUNTS_LIMIT.empresarial);
    await expect(pro.service.createShipment('user-1', shipment({ account: 'tienda-a' }), PRO_ACCOUNTS_LIMIT.base)).rejects.toBeInstanceOf(ForbiddenException);
    expect(pro.paths()).not.toContain('/envia_ya/service_order/save');
  });

  it('si la cuenta se reconectó en otra instancia, usa la sesión nueva', async () => {
    const pro = fakePro();
    await pro.service.connect('user-1', { email: 'a@b.pe', password: 'x' });
    const row = pro.rows.get('user-1/default');
    pro.rows.set('user-1/default', {
      ...row,
      email: 'nueva@b.pe',
      password: pro.secrets.seal('z'),
      session: pro.secrets.seal(JSON.stringify({ enviashalom_session: 'de-otra-instancia', 'XSRF-TOKEN': 'x' })),
    });
    await pro.service.createShipment('user-1', shipment());
    expect(pro.calls.find((c) => c.path === '/envia_ya/service_order/save')?.session).toBe('de-otra-instancia');
  });
});

describe('proAccountsLimit', () => {
  const key = (plans: ApiKeyRecord['plans']): ApiKeyRecord => ({ id: 'k', prefix: 'mk_', name: 'k', monthlyLimit: null, enabled: true, product: 'all', userId: 'user-1', plans });
  const now = new Date('2026-11-20T12:00:00Z');

  it('varias cuentas solo con Shalom Plataforma o Empresarial vigente', () => {
    expect(proAccountsLimit(key({ shalom: { plan: 'plataforma', monthlyLimit: null, expiresAt: null } }), now)).toBe(20);
    expect(proAccountsLimit(key({ shalom: { plan: 'plataforma', monthlyLimit: null, expiresAt: new Date('2026-11-01') } }), now)).toBe(1);
    expect(proAccountsLimit(key({ shalom: { plan: 'empresarial', monthlyLimit: null, expiresAt: null } }), now)).toBe(PRO_ACCOUNTS_LIMIT.empresarial);
    expect(proAccountsLimit(key({ shalom: { plan: 'empresarial', monthlyLimit: null, expiresAt: new Date('2026-12-20') } }), now)).toBe(PRO_ACCOUNTS_LIMIT.empresarial);
    expect(proAccountsLimit(key({ shalom: { plan: 'empresarial', monthlyLimit: null, expiresAt: new Date('2026-11-01') } }), now)).toBe(1);
    expect(proAccountsLimit(key({ shalom: { plan: 'basico', monthlyLimit: null, expiresAt: null } }), now)).toBe(1);
    expect(proAccountsLimit(key({ olva: { plan: 'empresarial', monthlyLimit: null, expiresAt: null } }), now)).toBe(1);
    expect(proAccountsLimit(key({}), now)).toBe(1);
  });
});
