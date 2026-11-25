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
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });
    const web = new ShalomWebClient({ ...config, shalom: { ...config.shalom, captcha: { poolSize: 1 } } } as AppConfig);
    await expect(web.isolated(async () => null)).rejects.toThrow(UpstreamError);
    fakeShalom();
    await expect(web.isolated(async () => 'ok')).resolves.toBe('ok');
  });

  it('si Shalom no responde a tiempo es un 504, no un carril colgado', async () => {
    vi.stubGlobal('fetch', async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    });
    const err = await new ShalomWebClient(config).isolated(async () => null).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.getStatus()).toBe(504);
  });
});

describe('ritmo del rastreo de Shalom (corta 60 s pasadas ~20 búsquedas por minuto)', () => {
  const T0 = Date.parse('2026-11-25T13:00:00Z');
  const paced = (trackPerMinute = 15) => new ShalomWebClient({ ...config, shalom: { ...config.shalom, trackPerMinute } } as AppConfig);

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Pide `n` turnos uno tras otro (como el job de un cliente) y devuelve cuándo salió cada uno. */
  async function sequential(web: ShalomWebClient, n: number, maxWaitMs = 600_000) {
    const at: number[] = [];
    const run = (async () => {
      for (let i = 0; i < n; i++) {
        await web.trackSlot(maxWaitMs);
        at.push(Date.now() - T0);
      }
    })();
    await vi.runAllTimersAsync();
    await run;
    return at;
  }

  it('unas pocas seguidas y luego una cada 60/trackPerMinute s', async () => {
    vi.useFakeTimers({ now: T0 });
    expect(await sequential(paced(15), 6)).toEqual([0, 0, 0, 4000, 8000, 12000]);
  });

  it('en ningún minuto pasan de 18 búsquedas, aunque lleguen 40 de golpe', async () => {
    vi.useFakeTimers({ now: T0 });
    const web = paced(15);
    const at: number[] = [];
    const all = Array.from({ length: 40 }, () => web.trackSlot(600_000).then(() => at.push(Date.now() - T0)));
    await vi.runAllTimersAsync();
    await Promise.all(all);
    const busiest = Math.max(...at.map((t) => at.filter((u) => u >= t && u <= t + 60_000).length));
    expect(busiest).toBeLessThanOrEqual(18);
    // 40 guías en ~2,5 min, todas atendidas.
    expect(at).toHaveLength(40);
    expect(Math.max(...at)).toBe(37 * 4000);
  });

  it('si el turno tarda más de lo que se puede esperar: 503 con Retry-After, sin llamar a Shalom', async () => {
    vi.useFakeTimers({ now: T0 });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const web = paced(15);
    await sequential(web, 3);
    const err = await web.trackSlot(1000).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.getStatus()).toBe(503);
    expect(err.message).toMatch(/en cola.*reintenta en 4 s/);
    expect(err.getResponse().detail).toEqual({ retryAfterSeconds: 4 });
    expect(fetch).not.toHaveBeenCalled();
    // Ese intento no gastó turno: el siguiente sale a los 4 s.
    expect(await sequential(web, 1)).toEqual([4000]);
  });

  it('tras un 429, no se le llama a Shalom hasta que levante; quien puede esperar, espera', async () => {
    vi.useFakeTimers({ now: T0 });
    let calls = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      calls++;
      if (url.endsWith('/api/local/session')) return json({ csrf: 'c', expiresAt: Math.floor(Date.now() / 1000) + 120 });
      return json({ success: false, message: 'Too many requests' }, 429, { 'retry-after': '60' });
    });
    const web = paced(15);
    await web.trackSlot();
    const err = (await web.isolated((post) => post('rastrea/buscar', { ose_id: '1' })).catch((e) => e)) as UpstreamError;
    expect(err.getStatus()).toBe(503);
    expect(err.message).toMatch(/Too many requests.*60 s/);
    const before = calls;

    // Un rastreo suelto (espera hasta 20 s) responde 503 al toque, y la ruta cortada no se llama.
    const quick = await web.trackSlot().catch((e) => e);
    expect(quick.getStatus()).toBe(503);
    expect(quick.getResponse().detail).toEqual({ retryAfterSeconds: 60 });
    await expect(web.isolated((post) => post('rastrea/buscar', { ose_id: '1' }))).rejects.toThrow(/Too many requests/);
    expect(calls).toBe(before);

    // Una guía de un batch (espera hasta 150 s) sale cuando Shalom levanta el corte.
    let out = false;
    const slot = web.trackSlot(150_000).then(() => (out = true));
    await vi.advanceTimersByTimeAsync(59_000);
    expect(out).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await slot;
    expect(out).toBe(true);
  });
});
