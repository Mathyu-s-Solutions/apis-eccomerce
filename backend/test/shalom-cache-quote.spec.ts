import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/configuration';
import type { PrismaService } from '../src/prisma/prisma.service';
import { guideKey, ShalomGuideCache } from '../src/modules/shalom/shalom-guide-cache';
import { ShalomService } from '../src/modules/shalom/shalom.service';
import type { ShalomWebClient } from '../src/modules/shalom/shalom-web.client';
import type { CaptchaProvider } from '../src/modules/shalom/captcha/captcha.provider';

/** Shalom simulado: cuenta las llamadas a cada ruta y los captchas. */
function fakeShalom() {
  const calls: Record<string, number> = {};
  let captchas = 0;
  const agencies = [
    { ter_id: 220, lugar_over: 'MALVINAS', zona: 'LIMA', departamento: 'LIMA', provincia: 'LIMA', destino: 1, origen: 1, ter_aereo: 1, dep_id: 15, prov_id: 1, dist_id: 1 },
    { ter_id: 7, lugar_over: 'AV PARRA 379', zona: 'AREQUIPA', departamento: 'AREQUIPA', provincia: 'AREQUIPA', destino: 1, origen: 1, ter_aereo: 1, dep_id: 4, prov_id: 1, dist_id: 1 },
    { ter_id: 9, lugar_over: 'SOLO RECIBE', zona: 'CUSCO', departamento: 'CUSCO', provincia: 'CUSCO', destino: 1, origen: 0, ter_aereo: 0, dep_id: 8, prov_id: 1, dist_id: 1 },
    { ter_id: 10, lugar_over: 'SOLO DESPACHA', zona: 'ICA', departamento: 'ICA', provincia: 'ICA', destino: 0, origen: 1, ter_aereo: 0, dep_id: 11, prov_id: 1, dist_id: 1 },
  ];
  const web = {
    post: async (route: string, body: Record<string, unknown>) => {
      calls[route] = (calls[route] ?? 0) + 1;
      if (route === 'agencias/listar') return { data: agencies };
      if (route === 'rastrea/buscar') return { data: { ose_id: 555, entregado: false, tiempo_llegada: '24 horas' } };
      if (route === 'rastrea/estados') return { message: 'En tránsito', data: { registrado: { fecha: '2026-10-01 10:00:00' }, transito: { fecha: '2026-10-02 08:00:00' } } };
      if (route === 'tarifa/mostrar') {
        const air = String(body.destiny).startsWith('0');
        return { data: { price: air ? 35 : 20, lead_time: air ? '24 horas' : '48 horas', tariff: { sobre: 8, cajapaquetexxs: 8, cajapaquetexs: 10, cajapaquetes: 12, cajapaquetem: 15, cajapaquetel: 20 }, data_tarifa: { distancia: air ? 0 : 1024.02 } } };
      }
      if (route === 'tarifa/reparto') return { data: [{ cs_costo: 5, des_nombre: 'PAQUETE  S' }, { cs_costo: 10, des_nombre: 'DE 5.1 KG HASTA 10 KG' }] };
      throw new Error(`ruta inesperada ${route}`);
    },
  } as unknown as ShalomWebClient;
  const captcha = { getToken: async () => { captchas++; return 'token'; } } as unknown as CaptchaProvider;
  const config = { shalom: { captcha: { poolSize: 2 } } } as unknown as AppConfig;
  const cache = new ShalomGuideCache({ enabled: false } as unknown as PrismaService);
  const service = new ShalomService(web, captcha, config, cache);
  return { service, calls, captchas: () => captchas };
}

describe('caché de guías de Shalom', () => {
  it('el hash no lleva la clave, no distingue mayúsculas y cambia con otra clave', async () => {
    const a = await guideKey('66479331', 'ab12');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await guideKey('66479331', 'AB12')).toBe(a);
    expect(await guideKey('66479331', 'AB13')).not.toBe(a);
    expect(a).not.toContain('AB12');
  });

  it('una guía resuelve un solo captcha: las consultas siguientes van sin captcha', async () => {
    const { service, calls, captchas } = fakeShalom();
    const first = await service.track({ orderNumber: '66479331', orderCode: 'AB12' });
    expect(first).toMatchObject({ status: 'IN_TRANSIT', transitTime: '24 horas' });
    const again = await service.track({ orderNumber: '66479331', orderCode: 'ab12' });
    expect(again).toMatchObject({ status: 'IN_TRANSIT', transitTime: '24 horas', trackingNumber: '66479331' });
    expect(captchas()).toBe(1);
    expect(calls['rastrea/buscar']).toBe(1);
    // Y el estado se guarda un minuto: la segunda consulta tampoco le pega a Shalom.
    expect(calls['rastrea/estados']).toBe(1);
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
