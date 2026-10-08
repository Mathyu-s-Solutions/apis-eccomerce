export interface ApiKeyRecord {
  id: string;
  /** Prefijo visible; la key completa nunca se guarda ni se expone. */
  prefix: string;
  name: string;
  monthlyLimit: number | null; // null = ilimitado
  enabled: boolean;
}

export interface ApiKeyUsage {
  period: string; // YYYYMM
  used: number;
  limit: number | null;
  remaining: number | null;
}

/**
 * Almacén de API keys y consumo. Implementaciones: memoria (dev) y Prisma.
 * La frontera permite cambiar de store sin tocar guard ni controllers.
 */
export abstract class ApiKeyStore {
  /** Busca por la key en claro (internamente compara su hash). */
  abstract findByKey(rawKey: string): Promise<ApiKeyRecord | null>;
  /** Suma uso de forma atómica. Lanza 429 si excede el límite. */
  abstract consume(record: ApiKeyRecord, units: number): Promise<ApiKeyUsage>;
  /** Devuelve unidades consumidas (p. ej. si la operación falló). */
  abstract refund(record: ApiKeyRecord, units: number): Promise<void>;
  abstract usage(record: ApiKeyRecord): Promise<ApiKeyUsage>;
}

export const API_KEY_STORE = Symbol('API_KEY_STORE');

export function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function toUsage(
  record: ApiKeyRecord,
  period: string,
  used: number,
): ApiKeyUsage {
  return {
    period,
    used,
    limit: record.monthlyLimit,
    remaining:
      record.monthlyLimit === null
        ? null
        : Math.max(0, record.monthlyLimit - used),
  };
}
