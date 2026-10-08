import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { currentPeriod } from './period';
import {
  freePlan,
  getBundle,
  getPlan,
  isProduct,
  PRODUCT_NAME,
  PRODUCTS,
  type PaymentItem,
  type Plan,
  type Product,
} from './plans';

/** Plan de un cliente en una API, como lo ve el panel. */
export interface AccountPlan {
  product: Product;
  plan: Plan;
  /** Cuota del plan (puede venir de un plan asignado a mano, distinto del catálogo). */
  monthlyLimit: number | null;
  expiresAt: Date | null;
  /** Tenía un plan pagado que ya venció (rige el gratis). */
  lapsed: boolean;
  used: number;
  /** Keys activas que llegan a esta API (las suyas y las de todas las APIs). */
  keys: number;
}

/**
 * Plan vigente de cada API: el de `subscriptions` si no venció; si no, el gratis.
 * Misma regla que el backend (backend/src/auth/plan-quota.ts).
 */
export async function getAccountPlans(userId: string, now = new Date()): Promise<AccountPlan[]> {
  const [subs, usage, keys] = await Promise.all([
    prisma.subscription.findMany({ where: { userId } }),
    prisma.planUsage.findMany({ where: { userId, period: currentPeriod(now) } }),
    prisma.apiKey.findMany({ where: { userId, enabled: true }, select: { product: true } }),
  ]);
  return PRODUCTS.map((product) => {
    const sub = subs.find((s) => s.product === product);
    const active = sub && (!sub.expiresAt || sub.expiresAt > now);
    const plan = active ? (getPlan(product, sub.plan) ?? customPlan(sub.plan, sub.monthlyLimit)) : freePlan(product);
    return {
      product,
      plan,
      monthlyLimit: active ? sub.monthlyLimit : plan.monthlyLimit,
      expiresAt: active ? sub.expiresAt : null,
      lapsed: !!sub && !active && sub.plan !== 'free',
      used: usage.find((u) => u.product === product)?.used ?? 0,
      keys: keys.filter((k) => k.product === product || k.product === 'all').length,
    };
  });
}

/** Un plan asignado a mano que no está en el catálogo. */
function customPlan(id: string, monthlyLimit: number | null): Plan {
  return { id, name: id.charAt(0).toUpperCase() + id.slice(1), pricedPen: 0, monthlyLimit, features: [] };
}

/** Lo que activa un pago: `items`, o el plan de los pagos de antes de los packs. */
export function paymentItems(payment: { product: string; plan: string; monthlyLimit: number | null; items: Prisma.JsonValue }): PaymentItem[] {
  if (Array.isArray(payment.items)) {
    return (payment.items as unknown as PaymentItem[]).filter((i) => isProduct(i?.product));
  }
  return isProduct(payment.product) ? [{ product: payment.product, plan: payment.plan, monthlyLimit: payment.monthlyLimit }] : [];
}

/** Texto de lo que compra un pago: "Pack Couriers" o "Shalom · Básico". */
export function paymentLabel(payment: { product: string; plan: string }): string {
  if (payment.product === 'bundle') return getBundle(payment.plan)?.name ?? payment.plan;
  const plan = getPlan(payment.product, payment.plan);
  const product = isProduct(payment.product) ? PRODUCT_NAME[payment.product] : payment.product;
  return `${product} · ${plan?.name ?? payment.plan}`;
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * Activa los planes de un pago aprobado. Cada uno vale un mes: si es el mismo plan
 * y sigue vigente, se suma al vencimiento actual (renovación); si es otro, empieza hoy.
 */
export async function grantPlans(
  tx: Prisma.TransactionClient,
  userId: string,
  items: PaymentItem[],
  now = new Date(),
): Promise<void> {
  for (const item of items) {
    const where = { userId_product: { userId, product: item.product } };
    const current = await tx.subscription.findUnique({ where });
    const renew = current?.plan === item.plan && (!current.expiresAt || current.expiresAt > now);
    // Un plan sin vencimiento (asignado a mano) se queda sin vencimiento.
    const expiresAt = renew && !current.expiresAt ? null : addMonths(renew ? current!.expiresAt! : now, 1);
    await tx.subscription.upsert({
      where,
      create: { userId, product: item.product, plan: item.plan, monthlyLimit: item.monthlyLimit, expiresAt },
      update: { plan: item.plan, monthlyLimit: item.monthlyLimit, expiresAt },
    });
  }
}
