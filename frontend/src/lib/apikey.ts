import crypto from 'node:crypto';

// Debe coincidir con backend/src/auth/api-key.hash.ts: el backend valida las
// keys por su SHA-256, así que el portal las crea con el mismo formato.

export function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function apiKeyPrefix(raw: string): string {
  return raw.slice(0, 12);
}

export function generateApiKey(): string {
  return `sk_live_${crypto.randomBytes(24).toString('hex')}`;
}
