import { Check, Sparkles } from 'lucide-react';
import { PLANS, PRODUCT_NAME, bundleListPrice, fairUse, unlimitedLabel, type Bundle, type Product } from '@/lib/plans';
import { billingHref, panelHref } from '@/lib/urls';
import { cn, formatNumber, formatSoles } from '@/lib/utils';
import { Card, Badge } from '@/components/ui/primitives';
import { ButtonLink } from '@/components/ui/button';

const UNIT: Record<Product, string> = { shalom: 'consultas', olva: 'consultas', sunat: 'comprobantes' };

/** Planes de una API: el precio es de esa API y la cuota la comparten todas tus keys. */
export function PlanGrid({ product }: { product: Product }) {
  const unit = UNIT[product];
  const plans = PLANS[product];
  return (
    <>
    <div className={cn('grid gap-6 sm:grid-cols-2', plans.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
      {plans.map((plan) => (
        <Card key={plan.id} className={cn('relative flex flex-col p-6', plan.highlight && 'ring-2 ring-[var(--accent)]')}>
          {plan.highlight && (
            <div className="absolute -top-3 left-6">
              <Badge tone="accent">Más elegido</Badge>
            </div>
          )}
          <h3 className="text-lg font-semibold">{plan.name}</h3>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-bold">{plan.pricedPen === 0 ? 'Gratis' : formatSoles(plan.pricedPen)}</span>
            {plan.pricedPen > 0 && <span className="text-sm text-[var(--muted)]">/mes</span>}
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {plan.monthlyLimit === null ? unlimitedLabel(product) : `${formatNumber(plan.monthlyLimit)} ${unit}/mes`}
          </p>
          <ul className="mt-5 flex-1 space-y-2.5 text-sm">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            {plan.pricedPen === 0 ? (
              <ButtonLink href={panelHref('/register')} variant="outline" className="w-full">Empezar gratis</ButtonLink>
            ) : (
              <ButtonLink
                href={billingHref({ product, plan: plan.id })}
                variant={plan.highlight ? 'primary' : 'outline'}
                className="w-full"
              >
                Elegir {plan.name}
              </ButtonLink>
            )}
          </div>
        </Card>
      ))}
    </div>
    {plans.some((p) => p.pricedPen > 0 && p.monthlyLimit === null) && (
      <p className="mt-4 text-xs text-[var(--muted)]">{fairUse(product)}</p>
    )}
    </>
  );
}

/** Pack de varias APIs a menos que por separado. */
export function BundleOffer({ bundle, className }: { bundle: Bundle; className?: string }) {
  const list = bundleListPrice(bundle);
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-[var(--dark)] p-6 text-white md:p-8',
        className,
      )}
    >
      <div className="flex max-w-xl flex-col gap-2">
        <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
          <Sparkles size={14} /> Promoción
        </span>
        <h3 className="text-2xl font-bold tracking-tight">
          {bundle.name}: {bundle.items.map((i) => PRODUCT_NAME[i.product]).join(' + ')}
        </h3>
        <p className="text-[15px] text-[var(--on-dark-muted)]">
          {bundle.description} con su cuota completa cada uno, en una sola cuenta y un solo pago.
        </p>
      </div>
      <div className="flex flex-col items-start gap-3 sm:items-end">
        <div className="flex items-baseline gap-2">
          {list > bundle.pricedPen && <span className="text-lg text-[var(--on-dark-muted)] line-through">{formatSoles(list)}</span>}
          <span className="text-4xl font-extrabold">{formatSoles(bundle.pricedPen)}</span>
          <span className="text-[var(--on-dark-muted)]">/mes</span>
        </div>
        {list > bundle.pricedPen && <span className="text-sm font-semibold text-[var(--tint)]">Ahorras {formatSoles(list - bundle.pricedPen)} al mes</span>}
        <ButtonLink href={billingHref({ bundle: bundle.id })} className="bg-white text-[var(--dark)] hover:bg-[var(--tint)]">
          Quiero el pack
        </ButtonLink>
      </div>
    </div>
  );
}
