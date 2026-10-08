import type { Product } from './product.decorator';

/** Plan vigente de un cliente en una API (fila de `subscriptions`). */
export interface PlanGrant {
  plan: string;
  monthlyLimit: number | null; // null = ilimitado
  expiresAt: Date | null; // null = no vence
}

export interface ApiKeyRecord {
  id: string;
  /** Prefijo visible; la key completa nunca se guarda ni se expone. */
  prefix: string;
  name: string;
  /** Cuota propia: solo cuenta si la key no tiene dueño. */
  monthlyLimit: number | null; // null = ilimitado
  enabled: boolean;
  /** API a la que da acceso: shalom | olva | sunat | all. */
  product: string;
  /** Cliente del portal dueño de la key; con dueño manda el plan de cada API. */
  userId: string | null;
  plans: Partial<Record<Product, PlanGrant>>;
}

export interface ApiKeyUsage {
  period: string; // YYYYMM
  used: number;
  limit: number | null;
  remaining: number | null;
  /** Plan del que sale la cuota (keys con dueño). */
  plan?: string;
}

/**
 * Almacén de API keys y consumo. Implementaciones: memoria (dev) y Prisma.
 * La frontera permite cambiar de store sin tocar guard ni controllers.
 * `product` es la API de la ruta: con él, una key con dueño gasta la cuota de
 * su plan (ver plan-quota.ts).
 */
export abstract class ApiKeyStore {
  /** Busca por la key en claro (internamente compara su hash). */
  abstract findByKey(rawKey: string): Promise<ApiKeyRecord | null>;
  /** Suma uso de forma atómica. Lanza 429 si excede el límite. */
  abstract consume(record: ApiKeyRecord, units: number, product?: Product): Promise<ApiKeyUsage>;
  /** Devuelve unidades consumidas (p. ej. si la operación falló). */
  abstract refund(record: ApiKeyRecord, units: number, product?: Product): Promise<void>;
  abstract usage(record: ApiKeyRecord, product?: Product): Promise<ApiKeyUsage>;
}

export const API_KEY_STORE = Symbol('API_KEY_STORE');

export function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function toUsage(
  limit: number | null,
  period: string,
  used: number,
  plan?: string,
): ApiKeyUsage {
  return {
    period,
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    ...(plan ? { plan } : {}),
  };
}
