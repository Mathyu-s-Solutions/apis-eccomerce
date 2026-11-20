import { getPlan, groupByBundle, type Purchase } from './plans';
import { addMonthsKeepingDay, limaDay, limaDaysUntil } from './renewal';

/**
 * Cambio a un plan o pack mayor a mitad del periodo: paga la diferencia por los
 * días que le quedan y sus planes siguen venciendo el mismo día (no se renuevan).
 * Lo usan el formulario del cliente (Pagos y planes), su API y "Registrar pago" del admin.
 */
export interface UpgradeQuote {
  /** Vencimiento de sus planes actuales: lo mantiene. */
  expiresAt: Date;
  /** Lo que paga hoy, en soles enteros (hacia arriba, mínimo 1). */
  amountPen: number;
  /** Lo que paga hoy al mes por esas APIs (su parte del pack, si tiene uno). */
  currentPen: number;
  /** Días que le quedan. */
  days: number;
}

type Sub = { product: string; plan: string; expiresAt: Date | null };

const listPrice = (s: { product: string; plan: string }) => getPlan(s.product, s.plan)?.pricedPen ?? 0;

/**
 * Es un cambio de plan si ya tiene un plan pagado vigente en alguna de las APIs de la
 * compra, cambia de plan en al menos una, todas vencen el mismo día y la compra
 * cuesta más que lo que paga hoy por ellas. Si no (compra nueva, renovación, bajar
 * de plan, planes sin vencimiento o con vencimientos distintos), null: rige la regla
 * de siempre (renewedExpiry).
 */
export function upgradeQuote(subs: Sub[], purchase: Purchase, now = new Date()): UpgradeQuote | null {
  const products = new Set<string>(purchase.items.map((i) => i.product));
  const active = subs.filter((s) => s.plan !== 'free' && (!s.expiresAt || s.expiresAt > now));
  const mine = active.filter((s) => products.has(s.product));
  if (mine.length === 0) return null;
  if (purchase.items.every((i) => mine.some((s) => s.product === i.product && s.plan === i.plan))) return null;

  const ends = mine.map((s) => s.expiresAt);
  if (ends.some((e) => e === null)) return null;
  const dates = ends as Date[];
  if (new Set(dates.map(limaDay)).size > 1) return null;
  const expiresAt = new Date(Math.max(...dates.map((d) => d.getTime())));

  // Un pack que tiene se reparte entre sus APIs según el precio de lista de cada plan.
  let currentPen = 0;
  for (const g of groupByBundle(active)) {
    const inside = g.subs.filter((s) => products.has(s.product));
    if (inside.length === 0) continue;
    const price = g.bundle ? g.bundle.pricedPen : listPrice(g.subs[0]);
    const total = g.subs.reduce((n, s) => n + listPrice(s), 0);
    currentPen += total > 0 ? (price * inside.reduce((n, s) => n + listPrice(s), 0)) / total : (price * inside.length) / g.subs.length;
  }
  if (purchase.pricedPen <= currentPen) return null;

  const start = addMonthsKeepingDay(expiresAt, -1);
  const left = Math.min(1, (expiresAt.getTime() - now.getTime()) / (expiresAt.getTime() - start.getTime()));
  const diff = Math.round((purchase.pricedPen - currentPen) * left * 100) / 100;
  return {
    expiresAt,
    amountPen: Math.max(1, Math.ceil(diff)),
    currentPen: Math.round(currentPen * 100) / 100,
    days: Math.max(1, limaDaysUntil(expiresAt, now)),
  };
}

/** Pagando `months` meses al cambiar de plan: la diferencia de este periodo y los meses extra a precio de lista. */
export function upgradeTotal(quote: UpgradeQuote, purchase: Purchase, months = 1): { amountPen: number; expiresAt: Date } {
  return {
    amountPen: quote.amountPen + purchase.pricedPen * (months - 1),
    expiresAt: addMonthsKeepingDay(quote.expiresAt, months - 1),
  };
}
