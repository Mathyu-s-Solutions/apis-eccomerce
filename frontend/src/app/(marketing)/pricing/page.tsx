import type { Metadata } from 'next';
import Link from 'next/link';
import { getSite } from '@/lib/brand-server';
import { BRANDS } from '@/lib/brands';
import { BUNDLES, PRODUCTS, bundlesWith } from '@/lib/plans';
import { siteHref } from '@/lib/urls';
import { BundleOffer, PlanGrid } from '@/components/marketing/plan-cards';

export const metadata: Metadata = { title: 'Precios' };

function HowToPay() {
  return (
    <div className="mx-auto mt-14 max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
      <h2 className="font-semibold">¿Cómo funciona el pago?</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Elige el plan de cada API (o un pack), yapea o plinea al número que te mostramos y sube la foto del comprobante.
        Validamos el pago y el plan queda activo por un mes. La cuota es de tu plan: la comparten todas tus keys de esa API.
      </p>
    </div>
  );
}

export default async function PricingPage() {
  const site = await getSite();

  // Sitio central: todas las APIs y los packs, en una sola página.
  if (site.id === 'hub') {
    return (
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight">Precios por API</h1>
          <p className="mt-3 text-[var(--muted)]">
            Una sola cuenta para todas. Pagas solo las APIs que usas, cada una con su plan.
          </p>
        </div>
        <div className="mt-10 space-y-4">
          {BUNDLES.map((b) => <BundleOffer key={b.id} bundle={b} />)}
        </div>
        {PRODUCTS.map((product) => (
          <section key={product} className="mt-16">
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-2xl font-bold tracking-tight">{BRANDS[product].name}</h2>
              <Link href={siteHref(product)} className="text-sm font-medium text-[var(--accent)]">
                Qué incluye {BRANDS[product].name} →
              </Link>
            </div>
            <PlanGrid product={product} />
          </section>
        ))}
        <HowToPay />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">Precios de {site.name}</h1>
        <p className="mt-3 text-[var(--muted)]">
          Elige un plan según tus consultas al mes. Paga con Yape o Plin: subes tu comprobante y activamos tu plan.
        </p>
      </div>
      <div className="mt-12">
        <PlanGrid product={site.id} />
      </div>
      <div className="mt-10 space-y-4">
        {bundlesWith(site.id).map((b) => <BundleOffer key={b.id} bundle={b} />)}
      </div>
      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        ¿Usas más APIs? Con la misma cuenta activas{' '}
        <Link href={siteHref('hub', '/pricing')} className="font-medium text-[var(--accent)]">Shalom, Olva y SUNAT</Link>.
      </p>
      <HowToPay />
    </div>
  );
}
