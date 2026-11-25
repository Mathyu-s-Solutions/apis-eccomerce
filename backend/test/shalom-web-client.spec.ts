import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config/configuration';
import { UpstreamError } from '../src/common/errors/upstream.error';
import { ShalomWebClient } from '../src/modules/shalom/shalom-web.client';

const config = { shalom: { webBase: 'https://shalom.test', captcha: { poolSize: 2 } } } as unknown as AppConfig;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/**
 * shalom.com.pe simulado: cuenta las sesiones abiertas y, como el real, rastrea/estados solo
 * responde la orden que buscó esa sesión. `limitSessions`: a partir de ahí, 429.
 */
function fakeShalom(limitSessions = Infinity) {
  const searched = new Map<string, number>();
  let sessions = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const headers = init.headers as Record<string, string>;
    const key = headers['x-session-key'];
    if (url.endsWith('/api/local/session')) {
      if (sessions >= limitSessions) return json({ success: false, message: 'Too many requests' }, 429, { 'retry-after': '60' });
      sessions++;
      return json({ csrf: `csrf-${sessions}`, expiresAt: Math.floor(Date.now() / 1000) + 120 });
    }
    const body = JSON.parse(String(init.body));
    // Otra búsqueda puede colarse aquí si dos rastreos compartieran la sesión.
    await new Promise((r) => setTimeout(r, 5));
    if (url.endsWith('/rastrea/buscar')) {
      searched.set(key, Number(body.ose_id));
      return json({ success: true, data: { ose_id: Number(body.ose_id) } });
    }
    if (url.endsWith('/rastrea/estados')) {
      if (searched.get(key) !== Number(body.ose_id)) return json({ success: false, message: 'Busque nuevamente la orden de servicio.' }, 409);
      return json({ success: true, message: 'En tránsito', data: {} });
    }
    return json({ success: true, data: [] });
  });
  return { sessions: () => sessions };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sesiones del rastreo de Shalom', () => {
  it('buscar y estados no se pisan, y las sesiones se reutilizan', async () => {
    const shalom = fakeShalom();
    const web = new ShalomWebClient(config);
    const track = (oseId: number) =>
      web.isolated(async (post) => {
        await post('rastrea/buscar', { ose_id: String(oseId) });
        return post<{ message: string }>('rastrea/estados', { ose_id: String(oseId) });
      });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => track(1000 + i)));
    expect(results.every((r) => r.message === 'En tránsito')).toBe(true);
    // Dos carriles (poolSize): dos sesiones para los 12 rastreos.
    expect(shalom.sessions()).toBe(2);
  });

  it('un 429 de Shalom es un 503 que dice cuándo reintentar', async () => {
    fakeShalom(0);
    const web = new ShalomWebClient(config);
    const err = await web.isolated(async () => null).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.getStatus()).toBe(503);
    expect(err.message).toMatch(/Too many requests.*60 s/);
  });

  it('una sesión que no se pudo abrir no se queda ocupada', async () => {
    fakeShalom(0);
    const web = new ShalomWebClient({ ...config, shalom: { ...config.shalom, captcha: { poolSize: 1 } } } as AppConfig);
    await expect(web.isolated(async () => null)).rejects.toThrow(UpstreamError);
    fakeShalom();
    await expect(web.isolated(async () => 'ok')).resolves.toBe('ok');
  });
});
