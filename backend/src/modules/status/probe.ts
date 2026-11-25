/**
 * Chequeos de la página de estado del portal (/status): cada uno hace una consulta real y
 * liviana a un servicio y dice si responde. El worker los corre cada 20 minutos y guarda el
 * resultado en `status_checks`.
 */

export type CheckStatus = 'up' | 'degraded' | 'down';

export interface Probe {
  /** Id del componente en `status_checks` y en la página (frontend/src/lib/status.ts). */
  id: string;
  /** Más lento que esto cuenta como "con demoras" (por defecto 5 s). */
  slowMs?: number;
  /** Límite de cada intento, si necesita otro que el de todos (por defecto 10 s). */
  timeoutMs?: number;
  /** Lanza si el servicio no funciona. Puede devolver `degraded` si responde pero con un problema. */
  run(signal: AbortSignal): Promise<{ degraded?: string } | void>;
}

export interface CheckResult {
  component: string;
  status: CheckStatus;
  latencyMs: number | null;
  /** Motivo legible y sin datos internos: se muestra tal cual en la página pública. */
  detail: string | null;
}

/** Error de un chequeo con un motivo que se puede mostrar en público ("HTTP 503"). */
export class ProbeError extends Error {
  constructor(readonly detail: string) {
    super(detail);
  }
}

export interface ProbeOptions {
  timeoutMs?: number;
  retryDelayMs?: number;
  /** Para el log: el error completo, que no va a la página. */
  onError?: (probe: Probe, err: unknown) => void;
}

const DEFAULT_SLOW_MS = 5_000;

/** Con punto decimal, como el resto del portal (es-PE). */
const seconds = (ms: number) => `${Math.round(ms / 100) / 10}`;

/** Motivo público de una falla: nunca el mensaje crudo (puede traer URLs o datos internos). */
export function publicDetail(err: unknown, timeoutMs: number): string {
  if (err instanceof ProbeError) return err.detail;
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') return `No respondió en ${seconds(timeoutMs)} s`;
  // fetch de Node: "fetch failed" con la causa de red (DNS, conexión rechazada, TLS…).
  if (err instanceof TypeError) return 'Sin conexión';
  return 'Respondió con un error';
}

type Attempt = { ok: true; latencyMs: number; degraded?: string } | { ok: false; latencyMs: number; error: unknown };

async function attempt(probe: Probe, timeoutMs: number): Promise<Attempt> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('timeout');
      err.name = 'TimeoutError';
      controller.abort(err);
      // También corta los chequeos que no escuchan la señal (el cliente web de Shalom).
      reject(err);
    }, timeoutMs);
  });
  const started = performance.now();
  try {
    const out = await Promise.race([probe.run(controller.signal), timeout]);
    return { ok: true, latencyMs: Math.round(performance.now() - started), degraded: out?.degraded };
  } catch (error) {
    return { ok: false, latencyMs: Math.round(performance.now() - started), error };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Corre un chequeo con su límite de tiempo. Si falla, espera y lo intenta una vez más: una
 * falla aislada que se recupera al reintentar cuenta como "con demoras", no como caída.
 */
export async function runProbe(probe: Probe, opts: ProbeOptions = {}): Promise<CheckResult> {
  const timeoutMs = probe.timeoutMs ?? opts.timeoutMs ?? 10_000;
  const slowMs = probe.slowMs ?? DEFAULT_SLOW_MS;

  let result = await attempt(probe, timeoutMs);
  let retried = false;
  if (!result.ok) {
    opts.onError?.(probe, result.error);
    await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 2_000));
    result = await attempt(probe, timeoutMs);
    retried = true;
    if (!result.ok) opts.onError?.(probe, result.error);
  }

  if (!result.ok) {
    return { component: probe.id, status: 'down', latencyMs: null, detail: publicDetail(result.error, timeoutMs) };
  }
  const detail = result.degraded ?? (retried ? 'Falló una vez y respondió al reintentar' : result.latencyMs > slowMs ? `Respondió en ${seconds(result.latencyMs)} s` : null);
  return { component: probe.id, status: detail ? 'degraded' : 'up', latencyMs: result.latencyMs, detail };
}
