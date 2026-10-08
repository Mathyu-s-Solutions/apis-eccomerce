import { getCurrentUser } from '@/lib/current-user';
import { BUNDLES, PLANS, PRODUCT_NAME, PRODUCTS, bundleListPrice, isProduct } from '@/lib/plans';
import { getAccountPlans } from '@/lib/subscriptions';
import { formatDate, formatSoles } from '@/lib/utils';
import { Badge, Card } from '@/components/ui/primitives';
import { PaymentForm, type PaymentChoice } from '@/components/dashboard/payment-form';
import { PaymentHistory } from '@/components/dashboard/payment-history';

/** Lo que se puede pagar: los packs y el plan de pago de cada API. */
function choices(): PaymentChoice[] {
  const bundles: PaymentChoice[] = BUNDLES.map((b) => {
    const list = bundleListPrice(b);
    return {
      value: `bundle:${b.id}`,
      group: 'Packs',
      label: `${b.name}: ${b.items.map((i) => PRODUCT_NAME[i.product]).join(' + ')} — ${formatSoles(b.pricedPen)}/mes${list > b.pricedPen ? ` (ahorras ${formatSoles(list - b.pricedPen)})` : ''}`,
      amountPen: b.pricedPen,
    };
  });
  const plans: PaymentChoice[] = PRODUCTS.flatMap((product) =>
    PLANS[product]
      .filter((p) => p.pricedPen > 0)
      .map((p) => ({
        value: `plan:${product}:${p.id}`,
        group: PRODUCT_NAME[product],
        label: `${PRODUCT_NAME[product]} ${p.name} — ${formatSoles(p.pricedPen)}/mes`,
        amountPen: p.pricedPen,
      })),
  );
  return [...bundles, ...plans];
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; plan?: string; bundle?: string }>;
}) {
  const user = (await getCurrentUser())!;
  const { product, plan, bundle } = await searchParams;
  const accountPlans = await getAccountPlans(user.id);
  const all = choices();

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
          Cada API tiene su plan y su precio. Paga con Yape o Plin: validamos tu comprobante y el plan queda activo por un mes.
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
        yape={process.env.NEXT_PUBLIC_YAPE_NUMBER ?? '—'}
        plin={process.env.NEXT_PUBLIC_PLIN_NUMBER ?? '—'}
        payName={process.env.NEXT_PUBLIC_PAY_NAME ?? "Mathyu's Solutions"}
      />

      <div>
        <h2 className="mb-3 font-semibold">Historial de pagos</h2>
        <PaymentHistory userId={user.id} />
      </div>
    </div>
  );
}
