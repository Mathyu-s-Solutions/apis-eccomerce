import { createHash } from 'node:crypto';

/**
 * Rastreador del límite por minuto: la API key (su hash, nunca la key) o, sin
 * key, la IP. Así cada cliente tiene su propio límite aunque comparta IP.
 */
export function apiKeyTracker(req: Record<string, any>): string {
  const raw = req.headers?.['x-api-key'];
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (typeof key === 'string' && key) return `key:${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
  return `ip:${req.ip}`;
}
