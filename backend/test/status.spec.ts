import { describe, expect, it } from 'vitest';
import { ProbeError, publicDetail, runProbe, type Probe } from '../src/modules/status/probe';

const fast = { timeoutMs: 200, retryDelayMs: 1 };

/** Un chequeo que hace lo que diga cada intento, en orden. */
function scripted(...attempts: Array<'ok' | 'slow' | 'hang' | Error | { degraded: string }>): Probe & { calls: number } {
  const probe = {
    id: 'x',
    slowMs: 50,
    calls: 0,
    async run() {
      const step = attempts[probe.calls++];
      if (step instanceof Error) throw step;
      if (step === 'slow') await new Promise((r) => setTimeout(r, 80));
      if (step === 'hang') await new Promise(() => {}); // no escucha la señal (como el cliente web de Shalom)
      if (typeof step === 'object') return step;
    },
  };
  return probe;
}

describe('chequeos de la página de estado', () => {
  it('responde bien: up, con su latencia y sin detalle', async () => {
    const r = await runProbe(scripted('ok'), fast);
    expect(r).toMatchObject({ component: 'x', status: 'up', detail: null });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('más lento que slowMs: con demoras', async () => {
    const r = await runProbe(scripted('slow'), fast);
    expect(r.status).toBe('degraded');
    expect(r.detail).toMatch(/^Respondió en 0\.\d s$/);
  });

  it('falla una vez y responde al reintentar: con demoras, no caída', async () => {
    const probe = scripted(new ProbeError('HTTP 503'), 'ok');
    const r = await runProbe(probe, fast);
    expect(probe.calls).toBe(2);
    expect(r).toMatchObject({ status: 'degraded', detail: 'Falló una vez y respondió al reintentar' });
  });

  it('falla dos veces: caída, con el motivo del último intento', async () => {
    const errors: unknown[] = [];
    const r = await runProbe(scripted(new ProbeError('HTTP 500'), new ProbeError('HTTP 503')), { ...fast, onError: (_, e) => errors.push(e) });
    expect(r).toEqual({ component: 'x', status: 'down', latencyMs: null, detail: 'HTTP 503' });
    expect(errors).toHaveLength(2);
  });

  it('corta un chequeo colgado aunque no escuche la señal', async () => {
    const r = await runProbe(scripted('hang', 'hang'), fast);
    expect(r).toMatchObject({ status: 'down', detail: 'No respondió en 0.2 s' });
  });

  it('el chequeo puede marcarse con demoras aunque responda', async () => {
    const r = await runProbe(scripted({ degraded: 'Padrón de SUNAT al 2026-11-01' }), fast);
    expect(r).toMatchObject({ status: 'degraded', detail: 'Padrón de SUNAT al 2026-11-01' });
  });

  it('nunca publica el mensaje crudo de un error', () => {
    expect(publicDetail(new ProbeError('HTTP 403'), 10_000)).toBe('HTTP 403');
    expect(publicDetail(new TypeError('fetch failed'), 10_000)).toBe('Sin conexión');
    expect(publicDetail(Object.assign(new Error('x'), { name: 'AbortError' }), 10_000)).toBe('No respondió en 10 s');
    expect(publicDetail(new Error('Fallo en https://interno/api?apikey=secreto'), 10_000)).toBe('Respondió con un error');
  });
});
