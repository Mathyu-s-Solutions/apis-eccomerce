import crypto from 'node:crypto';

/** SHA-256 hex de la key en claro. Es lo único que se persiste. */
export function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** Prefijo visible para identificar una key en paneles y logs. */
export function apiKeyPrefix(raw: string): string {
  return raw.slice(0, 12);
}

/** Genera una key nueva: sk_live_ + 48 hex (192 bits de entropía). */
export function generateApiKey(): string {
  return `sk_live_${crypto.randomBytes(24).toString('hex')}`;
}
