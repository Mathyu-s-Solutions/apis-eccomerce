import type { ApiKeyRecord } from './api-key.store';
import type { Product } from './product.decorator';

/**
 * Cuota del plan gratis de cada API. Igual que el plan "free" de
 * frontend/src/lib/plans.ts: mantener los dos en sync.
 */
export const FREE_MONTHLY_LIMIT: Record<Product, number> = {
  shalom: 20,
  olva: 20,
  sunat: 10,
};

/** De dónde sale la cuota de una llamada. */
export type QuotaScope =
  | { kind: 'plan'; userId: string; product: Product; plan: string; limit: number | null }
  | { kind: 'key'; limit: number | null };

/**
 * Una key con dueño gasta la cuota del plan del cliente para esa API (la
 * comparten todas sus keys); si no tiene plan, o venció, la del plan gratis.
 * Una key sin dueño (creada a mano con `pnpm key:create`) usa su propio límite.
 */
export function quotaScope(
  record: ApiKeyRecord,
  product: Product | undefined,
  now = new Date(),
): QuotaScope {
  if (!record.userId || !product) return { kind: 'key', limit: record.monthlyLimit };
  const grant = record.plans[product];
  if (grant && (!grant.expiresAt || grant.expiresAt > now)) {
    return { kind: 'plan', userId: record.userId, product, plan: grant.plan, limit: grant.monthlyLimit };
  }
  return { kind: 'plan', userId: record.userId, product, plan: 'free', limit: FREE_MONTHLY_LIMIT[product] };
}
