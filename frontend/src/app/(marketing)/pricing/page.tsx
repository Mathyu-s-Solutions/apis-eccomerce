import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import { getBrand } from '@/lib/brand-server';
import { PLANS } from '@/lib/plans';
import { formatNumber, formatSoles } from '@/lib/utils';
import { Card, Badge } from '@/components/ui/primitives';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Precios' };

export default async function PricingPage() {
  const brand = await getBrand();
  const plans = PLANS[brand.id];

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">Precios de {brand.name}</h1>
        <p className="mt-3 text-[var(--muted)]">
          Elige un plan según tus consultas al mes. Paga con Yape o Plin: subes tu comprobante y activamos tu cuota.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-4">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={`relative flex flex-col p-6 ${plan.highlight ? 'ring-2 ring-[var(--accent)]' : ''}`}
          >
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
              {plan.monthlyLimit === null ? 'Consultas ilimitadas' : `${formatNumber(plan.monthlyLimit)} consultas/mes`}
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
                <ButtonLink href="/register" variant="outline" className="w-full">Empezar gratis</ButtonLink>
              ) : (
                <ButtonLink href={`/dashboard/billing?plan=${plan.id}`} variant={plan.highlight ? 'primary' : 'outline'} className="w-full">
                  Elegir {plan.name}
                </ButtonLink>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="mx-auto mt-14 max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <h2 className="font-semibold">¿Cómo funciona el pago?</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Elige tu plan, yapea o plinea al número que te mostramos y sube la foto del comprobante.
          Recibimos un aviso, validamos el pago y tu nueva cuota queda activa. Así de simple.
        </p>
      </div>
    </div>
  );
}
