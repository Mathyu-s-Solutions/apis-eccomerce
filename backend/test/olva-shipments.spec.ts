import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { isWeakPin, OlvaShipmentSchema, type OlvaShipmentDto } from '../src/modules/olva/dto/olva-shipment.dto';
import { olvaMessage, type OlvaRegistroClient } from '../src/modules/olva/shipments/olva-registro.client';
import { generatePin, OlvaShipmentsService } from '../src/modules/olva/shipments/olva-shipments.service';

const base = {
  origin: '43',
  payment: 'store',
  sender: { documentType: 'ruc', document: '20123456789', firstNames: 'TIENDA', phone: '987654321', email: 'ventas@tienda.pe' },
  recipient: { documentType: 'dni', document: '12345678', firstNames: 'MARIA', lastName: 'PEREZ GOMEZ', phone: '912345678', email: 'maria@correo.pe' },
  destination: { type: 'store', officeId: '500' },
  package: { weightKg: 1.5, lengthCm: 30, widthCm: 20, heightCm: 10, categoryId: 227, declaredValue: 120 },
};
const shipment = (over: Record<string, unknown> = {}): OlvaShipmentDto => OlvaShipmentSchema.parse({ ...base, ...over });

describe('claves de Olva', () => {
  it('rechaza repetidos, consecutivos y patrones simples', () => {
    for (const pin of ['1111', '1234', '4321', '0123', '9876', '1212', '1122', '1112', '12a4']) expect(isWeakPin(pin)).toBe(true);
    for (const pin of ['4821', '1357', '9025', '3071']) expect(isWeakPin(pin)).toBe(false);
  });

  it('genera claves válidas', () => {
    for (let i = 0; i < 300; i++) expect(isWeakPin(generatePin())).toBe(false);
  });
});

describe('OlvaShipmentSchema', () => {
  const errors = (over: Record<string, unknown>) => {
    const r = OlvaShipmentSchema.safeParse({ ...base, ...over });
    return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
  };

  it('acepta el ejemplo y pone valores por defecto', () => {
    const dto = shipment();
    expect(dto.package.fragile).toBe(false);
    expect(dto.package.insurance).toBe(false);
  });

  it('valida documentos según su tipo', () => {
    expect(errors({ recipient: { ...base.recipient, document: '1234567' } })).toContain('recipient.document');
    expect(errors({ recipient: { ...base.recipient, lastName: undefined } })).toContain('recipient.lastName');
    expect(errors({ sender: { ...base.sender, document: '30123456789' } })).toContain('sender.document');
    expect(errors({ recipient: { ...base.recipient, documentType: 'passport', document: 'AB123456' } })).toEqual([]);
  });

  it('valida destino, valor declarado y clave', () => {
    expect(errors({ destination: { type: 'home', ubigeo: '040102', address: 'Calle Mercaderes 200', reference: 'ahí' } })).toContain('destination.reference');
    expect(errors({ destination: { type: 'avion' } })).toContain('destination.type');
    expect(errors({ package: { ...base.package, declaredValue: 800 } })).toContain('package.declaredValue');
    expect(errors({ pin: '1234' })).toEqual(['pin']);
    expect(errors({ sender: { ...base.sender, email: undefined } })).toContain('sender.email');
    expect(errors({ package: { ...base.package, categoryId: undefined } })).toContain('package.categoryId');
  });
});

describe('olvaMessage', () => {
  it('lee los errores problem+json de Olva', () => {
    expect(olvaMessage({ status: 422, title: 'Solicitud inválida', detail: 'The mode field is required. (and 1 more error)', errors: [{ detail: 'The mode field is required.' }] })).toBe(
      'The mode field is required. (and 1 more error)',
    );
    expect(olvaMessage({ title: 'No encontrado', errors: [{ detail: 'Falta el destino.' }] })).toBe('No encontrado Falta el destino.');
    expect(olvaMessage('<html>')).toBeUndefined();
  });
});

/** Registro de Olva simulado: rutas, pasos llamados y su `action` de captcha. */
function fakeOlva() {
  const calls: Array<{ method: string; path: string; body: unknown; action: string; mode?: string }> = [];
  const pdf = Buffer.from('%PDF-1.4 rótulo').toString('base64');
  const route = (method: string, path: string): { status: number; body: unknown } => {
    const p = path.split('?')[0];
    if (p === '/v1/shipping-records/headquarters')
      return {
        status: 200,
        body: {
          data: [
            { headquarter_id: '43', headquarter_name: 'LIMA', name: 'LIMA', ubigeo_id: '1392', ubigeo_code: '150101', ubigeo_concatenated: 'LIMA - LIMA - LIMA', address: 'AV ARGENTINA 4458', show_insurance_option: true, payment_modalities: [{ code: 'STORE' }, { code: 'DESTINATION' }] },
            { headquarter_id: '13', headquarter_name: 'AREQUIPA', ubigeo_code: '040101', show_insurance_option: false, payment_modalities: [{ code: 'ONLINE', payment_methods: [{ code: 'NIUBIZ' }, { code: 'PAGOEFECTIVO' }] }, { code: 'DESTINATION' }] },
            { headquarter_id: '99', headquarter_name: 'SOLO TARJETA', ubigeo_code: '150101', payment_modalities: [{ code: 'ONLINE', payment_methods: [{ code: 'NIUBIZ' }] }] },
          ],
        },
      };
    if (p === '/v1/shipping-records/destinations') {
      if (path.includes('mode=home'))
        return { status: 200, body: { data: [{ ubigeo_id: '371', ubigeo_code: '040102', district: 'ALTO SELVA ALEGRE', cargo_flag: '1', size_types_allowed: [{ code: 'custom', enabled: true }] }] } };
      return {
        status: 200,
        body: {
          data: [
            { office_id: '500', office_name: 'TIENDA PARRA', office_address: 'AV PARRA 388', ubigeo_code: '040101', ubigeo: { x: 1 }, cargo_flag: '1', delivery_type: 'O', is_agent: false, size_types_allowed: [{ code: 'custom', enabled: true }] },
            { office_id: '600', office_name: 'AGENTE CAYMA', ubigeo_code: '040103', is_agent: true, size_types_allowed: [] },
          ],
        },
      };
    }
    if (p === '/v1/shipping-records/article-categories') return { status: 200, body: { data: [{ id: 227, name: 'ROPA Y ACCESORIOS' }, { id: 396, name: 'DOCUMENTOS' }] } };
    if (p.startsWith('/v1/person/ruc/')) return { status: 200, body: { full_name: 'MI TIENDA SAC', contributor_status: 'ACTIVO', employee_id: 9, juridical_area_id: 2, tax_affectation_type: 1, package_headquarter_code: 'LIM' } };
    if (p.startsWith('/v1/person/')) return { status: 404, body: { title: 'No encontrado' } };
    if (method === 'POST' && p === '/v1/cart') return { status: 201, body: { session_id: 'cart-uuid-1' } };
    if (p === '/v1/geo/address') return { status: 200, body: { data: { address: 'Calle Los Mercaderes 200', coordinates: { latitude: -16.39, longitude: -71.53 }, polygon: 'AQP013', geocodingConfidence: 40 } } };
    if (p === '/v1/price/cart-uuid-1') return { status: 200, body: { data: { items: [], total_amount: 18.5, igv_total: 2.82 } } };
    // Formas reales (prueba del 2026-11-20).
    if (p === '/v1/cart/cart-uuid-1/payment/tienda') return { status: 201, body: { success: true, presale_id: 10269168, nro_pedido: 'PV-778899', remitos: '3123602-26--' } };
    if (p === '/v1/cart/cart-uuid-1/payment/pagoefectivo') return { status: 200, body: { status: 'OK' } };
    if (method === 'GET' && p === '/v1/cart/cart-uuid-1')
      return {
        status: 200,
        body: {
          session_id: 'cart-uuid-1',
          data: {
            nroPedidoPreventa: 'PV-778899',
            remito_list: '3123602-26--',
            presale_result: { presale_id: '10269168', nroPedidoPreventa: 'PV-778899', remitos: '3123602-26--' },
            pagoefectivo_result: { cip_code: '4455667', cip_url: 'https://pagoefectivo.pe/cip/4455667' },
          },
        },
      };
    if (p === '/v1/shipping-records/cart/cart-uuid-1/label') return { status: 200, body: { pdf_base64: pdf, filename: 'rotulo.pdf' } };
    return { status: 200, body: {} };
  };
  const client = {
    call: async (method: string, path: string, body: unknown, action: string, mode?: string) => {
      calls.push({ method, path, body, action, mode });
      const res = route(method, path);
      if (res.status >= 400) throw new Error(`${res.status} ${path}`);
      return res.body;
    },
    request: async (method: string, path: string, body: unknown, action: string, mode?: string) => {
      calls.push({ method, path, body, action, mode });
      return route(method, path);
    },
  } as unknown as OlvaRegistroClient;
  const rows = new Map<string, any>();
  const prisma = {
    enabled: true,
    olvaShipment: {
      create: async ({ data }: any) => rows.set(data.cartId, { ...data }).get(data.cartId),
      update: async ({ where, data }: any) => rows.set(where.cartId, { ...rows.get(where.cartId), ...data }).get(where.cartId),
      findUnique: async ({ where }: any) => rows.get(where.cartId) ?? null,
    },
  } as unknown as PrismaService;
  const service = new OlvaShipmentsService(client, prisma);
  const find = (path: string) => calls.find((c) => c.path.split('?')[0] === path);
  return { service, calls, rows, find };
}

describe('OlvaShipmentsService', () => {
  it('lista sedes con sus formas de pago y destinos filtrados', async () => {
    const olva = fakeOlva();
    expect(await olva.service.origins()).toEqual([
      expect.objectContaining({ id: '43', name: 'LIMA', ubigeo: '150101', payments: ['store', 'destination'], insurance: true }),
      expect.objectContaining({ id: '13', payments: ['pagoefectivo', 'destination'], insurance: false }),
      // Solo tarjeta (Niubiz): la API no lo soporta, no se ofrece.
      expect.objectContaining({ id: '99', payments: [] }),
    ]);
    const stores = await olva.service.destinations({ origin: '43', type: 'store', payment: 'destination', limit: 50 });
    // Con pago en destino no se recoge en agentes.
    expect(stores.map((s) => (s as { officeId: string }).officeId)).toEqual(['500']);
    await expect(olva.service.destinations({ origin: '13', type: 'store', payment: 'store', limit: 50 })).rejects.toThrow(/no acepta payment "store"/);
  });

  it('registra un envío a tienda: pasos, captcha por paso, clave y rótulo', async () => {
    const olva = fakeOlva();
    const result = await olva.service.createShipment('user-1', shipment());
    expect(result).toMatchObject({
      orderNumber: 'PV-778899',
      tracking: { orderNumber: '3123602', orderCode: '26' },
      cartId: 'cart-uuid-1',
      payment: 'store',
      total: 18.5,
      origin: { id: '43', name: 'LIMA' },
      destination: { type: 'store', name: 'TIENDA PARRA', ubigeo: '040101' },
      label: '/v1/olva/shipments/cart-uuid-1/label',
    });
    expect(isWeakPin(result.pin!)).toBe(false);
    expect(result.pagoEfectivo).toBeNull();

    const writes = olva.calls.filter((c) => c.method !== 'GET' || c.path.startsWith('/v1/price') || c.path === '/v1/cart/cart-uuid-1');
    expect(writes.map((c) => `${c.method} ${c.path} ${c.action}`)).toEqual([
      'POST /v1/cart cart_store',
      'PUT /v1/cart/cart-uuid-1/origin cart_origin_update',
      'PUT /v1/cart/cart-uuid-1/who-pays cart_who_pays_update',
      'POST /v1/cart/cart-uuid-1/item cart_item_store',
      'GET /v1/price/cart-uuid-1 price_show',
      'PUT /v1/shipping-records/cart/cart-uuid-1/pin shipping_pin_update',
      'POST /v1/cart/cart-uuid-1/payment/tienda payment_tienda',
      'GET /v1/cart/cart-uuid-1 cart_show',
    ]);
    // Las escrituras siempre llevan captcha.
    expect(writes.every((c) => c.mode === undefined || c.mode === 'always')).toBe(true);

    expect(olva.find('/v1/cart')?.body).toEqual({
      shipment_modality: 'package',
      person: expect.objectContaining({ document_type: 'ruc', document_number: '20123456789', first_names: 'MI TIENDA SAC', last_name: '', employee_id: 9, person_legal_area: 2, tax_affectation_type_id: 1, email: 'ventas@tienda.pe' }),
    });
    expect(olva.find('/v1/cart/cart-uuid-1/who-pays')?.body).toEqual({ who_pays: 'STORE' });
    const item = olva.find('/v1/cart/cart-uuid-1/item')?.body as any;
    expect(item.who_receive).toMatchObject({ document_type: 'dni', document_number: '12345678', first_names: 'MARIA', last_name: 'PEREZ GOMEZ' });
    // El correo del destinatario solo va con pago en destino.
    expect(item.who_receive.email).toBeUndefined();
    expect(item.destination).toMatchObject({ office_id: '500', delivery_type: 'O' });
    expect(item.destination).not.toHaveProperty('cargo_flag');
    expect(item.destination).not.toHaveProperty('ubigeo');
    expect(item.service).toEqual({ return_charge: false, delivery_type: 'O' });
    expect(item.what_send).toMatchObject({ shipment_type: 2, weight: 1.5, length: 30, width: 20, height: 10, article_id: 227, declared_value: 120, custom_size: true, size_id: '' });
    expect(olva.find('/v1/shipping-records/cart/cart-uuid-1/pin')?.body).toEqual({ pin: result.pin });

    expect(olva.rows.get('cart-uuid-1')).toMatchObject({ userId: 'user-1', orderNumber: 'PV-778899' });
    const label = await olva.service.label('user-1', 'cart-uuid-1');
    expect(label.data.subarray(0, 5).toString()).toBe('%PDF-');
    await expect(olva.service.label('user-2', 'cart-uuid-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a domicilio: geocodifica, sin clave, y paga el destinatario', async () => {
    const olva = fakeOlva();
    const result = await olva.service.createShipment(
      'user-1',
      shipment({
        payment: 'destination',
        sender: { documentType: 'dni', document: '44556677', firstNames: 'JUAN', lastName: 'RAMOS DIAZ', phone: '987654321', email: 'j@r.pe' },
        destination: { type: 'home', ubigeo: '040102', address: 'Calle Mercaderes 200', reference: 'Frente al parque' },
      }),
    );
    expect(result.pin).toBeNull();
    expect(olva.calls.some((c) => c.path.includes('/pin'))).toBe(false);
    expect(olva.find('/v1/cart/cart-uuid-1/who-pays')?.body).toEqual({ who_pays: 'DESTINATION' });
    // DNI que Olva no conoce: van los nombres que se mandan.
    expect((olva.find('/v1/cart')?.body as any).person).toMatchObject({ document_type: 'dni', first_names: 'JUAN', last_name: 'RAMOS DIAZ' });
    const item = olva.find('/v1/cart/cart-uuid-1/item')?.body as any;
    expect(item.destination).toMatchObject({ ubigeo_id: '371', address: 'Calle Los Mercaderes 200', reference: 'Frente al parque', latitude: -16.39, polygon: 'AQP013', delivery_type: 'D' });
    expect(item.service.delivery_type).toBe('D');
    expect(item.who_receive.email).toBe('maria@correo.pe');
  });

  it('con PagoEfectivo devuelve el código CIP y su enlace', async () => {
    const olva = fakeOlva();
    const result = await olva.service.createShipment('user-1', shipment({ origin: '13', payment: 'pagoefectivo', destination: { type: 'store', officeId: '500' } }));
    expect(olva.find('/v1/cart/cart-uuid-1/who-pays')?.body).toEqual({ who_pays: 'ONLINE' });
    const pay = olva.find('/v1/cart/cart-uuid-1/payment/pagoefectivo');
    expect(pay).toMatchObject({ body: { email: 'ventas@tienda.pe' }, action: 'payment_pagoefectivo' });
    expect(olva.calls.some((c) => c.path.endsWith('/payment/tienda'))).toBe(false);
    expect(result.pagoEfectivo).toEqual({ cip: '4455667', url: 'https://pagoefectivo.pe/cip/4455667' });
    await expect(olva.service.createShipment('user-1', shipment({ origin: '99', payment: 'pagoefectivo' }))).rejects.toThrow(/no acepta payment "pagoefectivo"/);
  });

  it('valida sede, forma de pago, destino y seguro antes de crear el carrito', async () => {
    const olva = fakeOlva();
    await expect(olva.service.createShipment('u', shipment({ origin: '99' }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(olva.service.createShipment('u', shipment({ origin: '13' }))).rejects.toThrow(/no acepta payment "store"/);
    await expect(olva.service.createShipment('u', shipment({ destination: { type: 'store', officeId: '600' }, payment: 'destination' }))).rejects.toThrow(/La tienda 600/);
    await expect(olva.service.createShipment('u', shipment({ destination: { type: 'home', ubigeo: '150101', address: 'Av Arequipa 100', reference: 'Frente al parque' } }))).rejects.toThrow(/no entrega a domicilio/);
    await expect(olva.service.createShipment('u', shipment({ origin: '13', payment: 'destination', package: { ...base.package, insurance: true } }))).rejects.toThrow(/no ofrece seguro/);
    await expect(olva.service.createShipment('u', shipment({ package: { ...base.package, categoryId: 1 } }))).rejects.toThrow(/no es una categoría/);
    expect(olva.calls.some((c) => c.path === '/v1/cart')).toBe(false);
  });
});
