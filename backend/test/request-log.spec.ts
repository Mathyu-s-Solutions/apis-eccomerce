import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { ApiKeyRecord, ApiKeyStore } from '../src/auth/api-key.store';
import type { PrismaService } from '../src/prisma/prisma.service';
import { logProps } from '../src/common/request-log/request-log.props';
import { MAX_PER_KEY, RequestLogService } from '../src/common/request-log/request-log.service';

const KEY: ApiKeyRecord = { id: 'k1', prefix: 'mk_live_ab12', name: 'prod', monthlyLimit: null, enabled: true, product: 'all', userId: 'u1', plans: {} };

function setup() {
  const rows: Array<Record<string, unknown>> = [];
  const prisma = { enabled: true, apiRequest: { create: async ({ data }: { data: Record<string, unknown> }) => rows.push(data) } } as unknown as PrismaService;
  const store = { findByKey: async (raw: string) => (raw === 'mk_live_ab12secret' ? KEY : null) } as unknown as ApiKeyStore;
  const log = new RequestLogService(prisma, store);
  const req = (url: string, opts: { route?: string; method?: string; headers?: Record<string, string> } = {}) =>
    ({ url, method: opts.method ?? 'POST', headers: opts.headers ?? {}, routeOptions: { url: opts.route } }) as unknown as FastifyRequest;
  const reply = (statusCode: number, elapsedTime = 812.4) => ({ statusCode, elapsedTime }) as unknown as FastifyReply;
  return { rows, log, req, reply };
}

describe('registro de requests del panel de admin', () => {
  it('guarda endpoint, status, tiempo y cuota; la ruta con sus parámetros, sin la query', async () => {
    const { rows, log, req, reply } = setup();
    const r = req('/v1/shalom/shipments/108569673/label?account=tienda', { route: '/v1/shalom/shipments/:oseId/label', method: 'GET' });
    Object.assign(logProps(r), { key: KEY, product: 'shalom', units: 1 });
    await log.record(r, reply(200));
    expect(rows).toEqual([
      { userId: 'u1', apiKeyId: 'k1', keyPrefix: 'mk_live_ab12', product: 'shalom', method: 'GET', route: '/v1/shalom/shipments/:oseId/label', status: 200, durationMs: 812, units: 1, error: null, upstream: null },
    ]);
  });

  it('en un error guarda el mensaje que recibió el cliente y no cobra', async () => {
    const { rows, log, req, reply } = setup();
    const r = req('/v1/shalom/track', { route: '/v1/shalom/track' });
    Object.assign(logProps(r), { key: KEY, product: 'shalom', units: 1, error: { message: 'Busque nuevamente la orden de servicio.', upstream: 'shalom' } });
    await log.record(r, reply(400));
    expect(rows[0]).toMatchObject({ status: 400, units: 0, error: 'Busque nuevamente la orden de servicio.', upstream: 'shalom' });
  });

  it('un 429 del límite por minuto (antes del guard) busca la key para saber de quién es', async () => {
    const { rows, log, req, reply } = setup();
    const r = req('/v1/olva/track', { route: '/v1/olva/track', headers: { 'x-api-key': 'mk_live_ab12secret' } });
    logProps(r).error = { message: 'ThrottlerException: Too Many Requests' };
    await log.record(r, reply(429));
    expect(rows[0]).toMatchObject({ userId: 'u1', product: 'olva', status: 429, error: 'ThrottlerException: Too Many Requests' });
  });

  it('una ruta que no existe se guarda sin números largos', async () => {
    const { rows, log, req, reply } = setup();
    await log.record(req('/v1/sunat/dni/45678912', { method: 'GET', headers: { authorization: 'Bearer mk_live_ab12secret' } }), reply(404));
    expect(rows[0]).toMatchObject({ route: '/v1/sunat/dni/:n', product: 'sunat', status: 404 });
  });

  it('no guarda lo que no es de un cliente: sin key, key inválida, rutas internas y /health', async () => {
    const { rows, log, req, reply } = setup();
    await log.record(req('/v1/shalom/track'), reply(401));
    await log.record(req('/v1/shalom/track', { headers: { 'x-api-key': 'otra' } }), reply(429));
    const internal = req('/v1/internal/cron/tick');
    logProps(internal).key = KEY;
    await log.record(internal, reply(200));
    await log.record(req('/health', { method: 'GET' }), reply(200));
    expect(rows).toHaveLength(0);
  });

  it('tiene topes por key: un cliente desbocado no llena la base', async () => {
    const { rows, log, req, reply } = setup();
    const now = Date.parse('2026-11-25T12:00:00Z');
    for (let i = 0; i < MAX_PER_KEY.minute + 10; i++) {
      const r = req('/v1/olva/agencies', { route: '/v1/olva/agencies', method: 'GET' });
      logProps(r).key = KEY;
      await log.record(r, reply(200), now);
    }
    expect(rows).toHaveLength(MAX_PER_KEY.minute);
    // Al minuto siguiente vuelve a registrar.
    const r = req('/v1/olva/agencies', { route: '/v1/olva/agencies', method: 'GET' });
    logProps(r).key = KEY;
    await log.record(r, reply(200), now + 60_000);
    expect(rows).toHaveLength(MAX_PER_KEY.minute + 1);
  });
});
