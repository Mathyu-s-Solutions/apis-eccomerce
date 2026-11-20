import { getCurrentUser } from '@/lib/current-user';
import { BUNDLES, PLANS, PRODUCT_NAME, PRODUCTS, bundleListPrice, isProduct, purchaseOf } from '@/lib/plans';
import { getAccountPlans } from '@/lib/subscriptions';
import { upgradeQuote } from '@/lib/upgrade';
import { formatDate, formatSoles } from '@/lib/utils';
import { Badge, Card } from '@/components/ui/primitives';
import { PaymentForm, type PaymentChoice } from '@/components/dashboard/payment-form';
import { PaymentHistory } from '@/components/dashboard/payment-history';

type Sub = { product: string; plan: string; expiresAt: Date | null };

/**
 * Lo que se puede pagar: los packs y el plan de pago de cada API. Si ya tiene un
 * plan y elige uno mayor, paga hoy la diferencia por los días que le quedan
 * (lib/upgrade.ts, la misma cuenta que hace /api/payments).
 */
function choices(subs: Sub[], now: Date): PaymentChoice[] {
  const bundles = BUNDLES.map((b) => {
    const list = bundleListPrice(b);
    return choice(`bundle:${b.id}`, 'Packs', `${b.name}: ${b.items.map((i) => PRODUCT_NAME[i.product]).join(' + ')}`, b.pricedPen, list > b.pricedPen ? ` (ahorras ${formatSoles(list - b.pricedPen)})` : '', subs, now);
  });
  const plans = PRODUCTS.flatMap((product) =>
    PLANS[product]
      .filter((p) => p.pricedPen > 0)
      .map((p) => choice(`plan:${product}:${p.id}`, PRODUCT_NAME[product], `${PRODUCT_NAME[product]} ${p.name}`, p.pricedPen, '', subs, now)),
  );
  return [...bundles, ...plans];
}

function choice(value: string, group: string, name: string, pricedPen: number, savings: string, subs: Sub[], now: Date): PaymentChoice {
  const purchase = purchaseOf(value);
  const quote = purchase ? upgradeQuote(subs, purchase, now) : null;
  if (!quote) return { value, group, label: `${name} — ${formatSoles(pricedPen)}/mes${savings}`, amountPen: pricedPen };
  return {
    value,
    group,
    label: `${name} — ${formatSoles(quote.amountPen)} hoy (cambio de plan), luego ${formatSoles(pricedPen)}/mes`,
    amountPen: quote.amountPen,
    upgrade: { days: quote.days, until: formatDate(quote.expiresAt), monthlyPen: pricedPen },
  };
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; plan?: string; bundle?: string }>;
}) {
  const user = (await getCurrentUser())!;
  const { product, plan, bundle } = await searchParams;
  const now = new Date();
  const accountPlans = await getAccountPlans(user.id, now);
  const all = choices(accountPlans.map((p) => ({ product: p.product, plan: p.plan.id, expiresAt: p.expiresAt })), now);

  // Lo que viene elegido desde una landing o el resumen: un pack, un plan, o la API.
  const wanted = bundle
    ? `bundle:${bundle}`
    : isProduct(product)
      ? `plan:${product}:${plan ?? PLANS[product].find((p) => p.highlight)?.id ?? ''}`
      : '';
  const initial = all.find((c) => c.value === wanted)?.value ?? all[0].value;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pagos y planes</h1>
        <p className="mt-1 text-[var(--muted)]">
          Cada API tiene su plan y su precio. Paga con Yape o Plin: validamos tu comprobante y el plan queda activo hasta el mismo día del mes siguiente.
          Si ya tienes un plan y pasas a uno mayor, pagas solo la diferencia por los días que te quedan.
        </p>
      </div>

      <Card className="divide-y divide-[var(--border)]">
        {accountPlans.map((p) => (
          <div key={p.product} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-sm">
            <span className="font-medium">{PRODUCT_NAME[p.product]}</span>
            <span className="flex items-center gap-2 text-[var(--muted)]">
              <Badge tone={p.plan.id === 'free' ? 'neutral' : 'accent'}>{p.plan.name}</Badge>
              {p.plan.id === 'free' ? (p.lapsed ? 'venció' : 'gratis') : p.expiresAt ? `hasta el ${formatDate(p.expiresAt)}` : 'sin vencimiento'}
            </span>
          </div>
        ))}
      </Card>

      <PaymentForm
        choices={all}
        initial={initial}
        number={process.env.NEXT_PUBLIC_YAPE_NUMBER ?? '—'}
        payName={process.env.NEXT_PUBLIC_PAY_NAME ?? "Mathyu's Solutions"}
      />

      <div>
        <h2 className="mb-3 font-semibold">Historial de pagos</h2>
        <PaymentHistory userId={user.id} />
      </div>
    </div>
  );
}
