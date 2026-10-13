import { createHash } from 'node:crypto';
import { extractApiKey } from './api-key.guard';

/**
 * Rastreador del límite por minuto: la API key (su hash, nunca la key) o, sin
 * key, la IP. Así cada cliente tiene su propio límite aunque comparta IP.
 */
export function apiKeyTracker(req: Record<string, any>): string {
  const key = extractApiKey(req.headers);
  if (typeof key === 'string' && key) return `key:${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
  return `ip:${req.ip}`;
}
