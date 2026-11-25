import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config/configuration';
import type { PrismaService } from '../src/prisma/prisma.service';
import { UpstreamError } from '../src/common/errors/upstream.error';
import { guideKey, ShalomGuideCache } from '../src/modules/shalom/shalom-guide-cache';
import { ShalomService } from '../src/modules/shalom/shalom.service';
import type { ShalomWebClient } from '../src/modules/shalom/shalom-web.client';
import type { CaptchaProvider } from '../src/common/captcha/captcha.provider';

/** Guías que Shalom tiene: guía + clave → ose_id. */
const ORDERS = [
  { numero: '66479331', codigo: 'AB12', ose_id: 555 },
  { numero: '66479332', codigo: 'CD34', ose_id: 556 },
];

/**
 * Shalom simulado: cuenta las llamadas a cada ruta, los captchas y las sesiones.
 * Como el real (desde nov-2026), rastrea/estados solo responde la orden que
 * buscó esa misma sesión.
 */
function fakeShalom() {
  const calls: Record<string, number> = {};
  let captchas = 0;
  let sessions = 0;
  const agencies = [
    { ter_id: 220, lugar_over: 'MALVINAS', zona: 'LIMA', departamento: 'LIMA', provincia: 'LIMA', destino: 1, origen: 1, ter_aereo: 1, dep_id: 15, prov_id: 1, dist_id: 1 },
    { ter_id: 7, lugar_over: 'AV PARRA 379', zona: 'AREQUIPA', departamento: 'AREQUIPA', provincia: 'AREQUIPA', destino: 1, origen: 1, ter_aereo: 1, dep_id: 4, prov_id: 1, dist_id: 1 },
    { ter_id: 9, lugar_over: 'SOLO RECIBE', zona: 'CUSCO', departamento: 'CUSCO', provincia: 'CUSCO', destino: 1, origen: 0, ter_aereo: 0, dep_id: 8, prov_id: 1, dist_id: 1 },
    { ter_id: 10, lugar_over: 'SOLO DESPACHA', zona: 'ICA', departamento: 'ICA', provincia: 'ICA', destino: 0, origen: 1, ter_aereo: 0, dep_id: 11, prov_id: 1, dist_id: 1 },
  ];
  const handle = async (session: { searched?: number }, route: string, body: Record<string, unknown>) => {
    calls[route] = (calls[route] ?? 0) + 1;
    if (route === 'agencias/listar') return { data: agencies };
    if (route === 'rastrea/buscar') {
      // Otra búsqueda puede colarse aquí si la sesión fuera compartida.
      await new Promise((r) => setImmediate(r));
      const o = ORDERS.find((x) => (body.ose_id ? String(x.ose_id) === String(body.ose_id) : x.numero === body.numero && x.codigo === body.codigo));
      if (!o) throw new UpstreamError('shalom', 'No se encontró la orden de servicio.', { status: 400 });
      session.searched = o.ose_id;
      return { data: { ose_id: o.ose_id, entregado: false, tiempo_llegada: '24 horas' } };
    }
    if (route === 'rastrea/estados') {
      if (session.searched !== Number(body.ose_id)) throw new UpstreamError('shalom', 'Busque nuevamente la orden de servicio.', { status: 400 });
      return { message: 'En tránsito', data: { registrado: { fecha: '2026-10-01 10:00:00' }, transito: { fecha: '2026-10-02 08:00:00' } } };
    }
    if (route === 'tarifa/mostrar') {
      const air = String(body.destiny).startsWith('0');
      return { data: { price: air ? 35 : 20, lead_time: air ? '24 horas' : '48 horas', tariff: { sobre: 8, cajapaquetexxs: 8, cajapaquetexs: 10, cajapaquetes: 12, cajapaquetem: 15, cajapaquetel: 20 }, data_tarifa: { distancia: air ? 0 : 1024.02 } } };
    }
    if (route === 'tarifa/reparto') return { data: [{ cs_costo: 5, des_nombre: 'PAQUETE  S' }, { cs_costo: 10, des_nombre: 'DE 5.1 KG HASTA 10 KG' }] };
    throw new Error(`ruta inesperada ${route}`);
  };
  const shared = {};
  const web = {
    trackSlot: async () => {},
    post: (route: string, body: Record<string, unknown>) => handle(shared, route, body),
    isolated: async <T>(fn: (post: (route: string, body: Record<string, unknown>) => Promise<unknown>) => Promise<T>) => {
      sessions++;
      const session = {};
      return fn((route, body) => handle(session, route, body));
    },
  } as unknown as ShalomWebClient;
  const captcha = { getToken: async () => { captchas++; return 'token'; } } as unknown as CaptchaProvider;
  const config = { shalom: { captcha: { poolSize: 2 } } } as unknown as AppConfig;
  const cache = new ShalomGuideCache({ enabled: false } as unknown as PrismaService);
  const service = new ShalomService(web, captcha, config, cache);
  return { service, web, calls, captchas: () => captchas, sessions: () => sessions };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('caché de guías de Shalom', () => {
  it('el hash no lleva la clave, no distingue mayúsculas y cambia con otra clave', async () => {
    const a = await guideKey('66479331', 'ab12');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await guideKey('66479331', 'AB12')).toBe(a);
    expect(await guideKey('66479331', 'AB13')).not.toBe(a);
    expect(a).not.toContain('AB12');
  });

  it('buscar y estados van en la misma sesión; antes del minuto, sin volver a Shalom', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { service, calls, captchas, sessions } = fakeShalom();
    const first = await service.track({ orderNumber: '66479331', orderCode: 'AB12' });
    expect(first).toMatchObject({ status: 'IN_TRANSIT', transitTime: '24 horas' });
    expect(sessions()).toBe(1);

    // El estado se guarda un minuto: la segunda consulta no le pega a Shalom.
    const again = await service.track({ orderNumber: '66479331', orderCode: 'ab12' });
    expect(again).toMatchObject({ status: 'IN_TRANSIT', transitTime: '24 horas', trackingNumber: '66479331' });
    expect(captchas()).toBe(1);
    expect(calls['rastrea/estados']).toBe(1);

    // Pasado el minuto, la guía ya está en el caché, pero Shalom pide buscarla de nuevo
    // ("Busque nuevamente la orden de servicio." si se va directo a estados).
    vi.setSystemTime(Date.now() + 61_000);
    const later = await service.track({ orderNumber: '66479331', orderCode: 'AB12' });
    expect(later).toMatchObject({ status: 'IN_TRANSIT', trackingNumber: '66479331' });
    expect(captchas()).toBe(2);
    expect(calls['rastrea/buscar']).toBe(2);
    expect(sessions()).toBe(2);
  });

  it('guías a la vez: cada una en su sesión, sin pisarse', async () => {
    const { service, sessions } = fakeShalom();
    const results = await service.trackBatch([
      { orderNumber: '66479331', orderCode: 'AB12' },
      { orderNumber: '66479332', orderCode: 'CD34' },
      { orderNumber: '99999999', orderCode: 'ZZZZ' },
    ]);
    expect(results.map((r) => r?.trackingNumber ?? null)).toEqual(['66479331', '66479332', null]);
    expect(sessions()).toBe(3);
  });

  it('por ose_id: busca por el ose_id y lee sus estados; null si Shalom no lo tiene', async () => {
    const { service, calls, captchas } = fakeShalom();
    expect(await service.statusByOseId('556', '66479332')).toMatchObject({ status: 'IN_TRANSIT', trackingNumber: '66479332', transitTime: '24 horas' });
    expect(await service.statusByOseId('556')).toMatchObject({ status: 'IN_TRANSIT' });
    expect(captchas()).toBe(1);
    expect(calls['rastrea/estados']).toBe(1);
    expect(await service.statusByOseId('1')).toBeNull();
  });

  it('una guía inexistente da null (y no se guarda)', async () => {
    const { service, captchas } = fakeShalom();
    expect(await service.trackGuide({ orderNumber: '99999999', orderCode: 'ZZZZ' })).toBeNull();
    expect(await service.trackGuide({ orderNumber: '99999999', orderCode: 'ZZZZ' })).toBeNull();
    expect(captchas()).toBe(2);
  });

  it('sin turno (Shalom limitando) responde el 503 sin gastar captcha; con turno, rastrea y lo anota', async () => {
    const { service, web, calls, captchas } = fakeShalom();
    const busy = new UpstreamError('shalom', 'Shalom está limitando las consultas (Too many requests): reintenta en 60 s.', { status: 503 });
    const slot = vi.spyOn(web, 'trackSlot').mockRejectedValueOnce(busy);
    await expect(service.trackGuide({ orderNumber: '66479331', orderCode: 'AB12' })).rejects.toBe(busy);
    expect(captchas()).toBe(0);
    expect(calls['rastrea/buscar']).toBeUndefined();
    expect(service.trackedRecently(60_000)).toBe(false);
    // Un batch espera su turno más que un rastreo suelto.
    await service.trackBatch([{ orderNumber: '66479331', orderCode: 'AB12' }]);
    expect(slot).toHaveBeenLastCalledWith(150_000);
    expect(service.trackedRecently(60_000)).toBe(true);
  });
});

describe('cotización de Shalom', () => {
  it('mínimo, precio por caja y tiempo de llegada; aéreo con 0 delante del destino', async () => {
    const { service } = fakeShalom();
    const ground = await service.quote({ origin: '220', destination: '7' });
    expect(ground).toMatchObject({
      origin: { code: '220', name: 'MALVINAS' },
      destination: { code: '7', name: 'AV PARRA 379' },
      service: 'ground',
      leadTime: '48 horas',
      distanceKm: 1024.02,
      minimumCharge: 20,
      packages: { envelope: 8, xxs: 8, xs: 10, s: 12, m: 15, l: 20 },
    });
    expect(await service.quote({ origin: '220', destination: '7', air: true })).toMatchObject({ service: 'air', leadTime: '24 horas', minimumCharge: 35, distanceKm: null });
  });

  it('una ruta resuelve un captcha cada 6 h; el recargo a domicilio no usa captcha', async () => {
    const { service, captchas, calls } = fakeShalom();
    await service.quote({ origin: '220', destination: '7' });
    const q = await service.quote({ origin: '220', destination: '7', homeDelivery: true });
    expect(captchas()).toBe(1);
    expect(calls['tarifa/mostrar']).toBe(1);
    expect(q.homeDelivery).toEqual([{ size: 'PAQUETE S', price: 5 }, { size: 'DE 5.1 KG HASTA 10 KG', price: 10 }]);
  });

  it('valida las agencias antes de gastar un captcha', async () => {
    const { service, captchas } = fakeShalom();
    await expect(service.quote({ origin: '999', destination: '7' })).rejects.toThrow(/origen 999/);
    await expect(service.quote({ origin: '9', destination: '7' })).rejects.toThrow(/no despacha/);
    await expect(service.quote({ origin: '220', destination: '10' })).rejects.toThrow(/no recibe envíos/);
    await expect(service.quote({ origin: '220', destination: '9', air: true })).rejects.toThrow(BadRequestException);
    expect(captchas()).toBe(0);
  });
});
