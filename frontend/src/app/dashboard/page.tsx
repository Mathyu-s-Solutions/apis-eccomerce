import Link from 'next/link';
import { ArrowRight, KeyRound } from 'lucide-react';
import { getCurrentUser } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { BRANDS } from '@/lib/brands';
import { currentPeriod } from '@/lib/period';
import { BUNDLES, PLANS, PRODUCT_NAME } from '@/lib/plans';
import { getAccountPlans, type AccountPlan } from '@/lib/subscriptions';
import { siteHref } from '@/lib/urls';
import { formatDate } from '@/lib/utils';
import { Alert, Badge, Card } from '@/components/ui/primitives';
import { ButtonLink } from '@/components/ui/button';
import { UsageBar } from '@/components/dashboard/usage-bar';
import { BundleOffer } from '@/components/marketing/plan-cards';

function planStatus(p: AccountPlan): string {
  if (p.lapsed) return 'Tu plan venció: rige el de prueba hasta que lo renueves.';
  if (p.plan.id === 'free') return 'Plan de prueba, sin costo.';
  return p.expiresAt ? `Vigente hasta el ${formatDate(p.expiresAt)}.` : 'Sin vencimiento.';
}

/** Días que faltan para un vencimiento (contando el día de hoy). */
const daysUntil = (d: Date) => Math.ceil((d.getTime() - Date.now()) / 86_400_000);

function ApiCard({ p, renewHref }: { p: AccountPlan; renewHref: string }) {
  const brand = BRANDS[p.product];
  const paid = p.plan.id !== 'free';
  const top = PLANS[p.product].at(-1)?.id === p.plan.id;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="block h-1.5 w-10 rounded-full" style={{ background: brand.theme.signature }} />
          <h2 className="mt-3 font-semibold">{brand.name}</h2>
          <p className="text-xs text-[var(--muted)]">{planStatus(p)}</p>
        </div>
        <Badge tone={paid ? 'accent' : 'neutral'}>{p.plan.name}</Badge>
      </div>
      <UsageBar used={p.used} limit={p.monthlyLimit} />
      <p className="text-xs text-[var(--muted)]">
        {p.keys === 0 ? 'Aún no tienes keys para esta API.' : `${p.keys} ${p.keys === 1 ? 'key usa' : 'keys usan'} esta cuota.`}
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        {!top && (
          <ButtonLink href={`/dashboard/billing?product=${p.product}`} size="sm">
            {paid ? 'Cambiar de plan' : 'Mejorar plan'}
          </ButtonLink>
        )}
        {paid && p.expiresAt && (
          <ButtonLink href={renewHref} size="sm" variant="outline">
            Renovar
          </ButtonLink>
        )}
        <ButtonLink href={`/dashboard/keys?product=${p.product}`} size="sm" variant="outline">
          <KeyRound size={14} /> Keys
        </ButtonLink>
        <Link href={siteHref(p.product, '/docs')} className="inline-flex items-center px-1 text-sm font-medium text-[var(--accent)]">
          Docs
        </Link>
      </div>
    </Card>
  );
}

export default async function DashboardHome() {
  const user = (await getCurrentUser())!;
  const [plans, pendingPayments] = await Promise.all([
    getAccountPlans(user.id),
    prisma.payment.count({ where: { userId: user.id, status: 'pending' } }),
  ]);
  const anyKey = plans.some((p) => p.keys > 0);
  // Packs con alguna API que todavía no tiene en ese plan.
  const offers = BUNDLES.filter((b) =>
    b.items.some((i) => plans.find((p) => p.product === i.product)?.plan.id !== i.plan),
  );
  // Si tiene todo un pack, se renueva el pack (sale más barato que cada plan).
  const owned = BUNDLES.find((b) => b.items.every((i) => plans.find((p) => p.product === i.product)?.plan.id === i.plan));
  const renewHref = (p: AccountPlan) =>
    owned?.items.some((i) => i.product === p.product) ? `/dashboard/billing?bundle=${owned.id}` : `/dashboard/billing?product=${p.product}&plan=${p.plan.id}`;
  // Vencimientos de los próximos 7 días (o ya vencidos), uno por fecha.
  const dueSoon = plans.filter((p) => p.plan.id !== 'free' && p.expiresAt && daysUntil(p.expiresAt) <= 7);
  const lapsed = plans.filter((p) => p.lapsed);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hola{user.name ? `, ${user.name}` : ''} 👋</h1>
        <p className="mt-1 text-[var(--muted)]">
          Tus APIs, su plan y el consumo de {currentPeriod().replace(/^(\d{4})(\d{2})$/, '$2/$1')}. La cuota de cada API es de tu plan y la comparten todas tus keys.
        </p>
      </div>

      {pendingPayments > 0 && (
        <Alert>
          Tienes {pendingPayments} {pendingPayments === 1 ? 'pago' : 'pagos'} por validar. Te avisamos al activarlo;{' '}
          <Link href="/dashboard/billing" className="font-medium text-[var(--accent)]">ver pagos</Link>.
        </Alert>
      )}

      {(dueSoon.length > 0 || lapsed.length > 0) && (
        <Alert tone={lapsed.length ? 'error' : 'info'}>
          {lapsed.length > 0
            ? `Tu plan de ${lapsed.map((p) => PRODUCT_NAME[p.product]).join(' y ')} venció: rige el de prueba hasta que lo renueves. `
            : `Tu plan de ${dueSoon.map((p) => PRODUCT_NAME[p.product]).join(' y ')} se renueva el ${formatDate(dueSoon[0].expiresAt!)}${owned && dueSoon.every((p) => owned.items.some((i) => i.product === p.product)) ? ` (${owned.name}, S/ ${owned.pricedPen})` : ''}. Paga antes para no quedarte sin servicio. `}
          <Link href={renewHref(lapsed[0] ?? dueSoon[0])} className="font-medium text-[var(--accent)]">Renovar ahora</Link>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => <ApiCard key={p.product} p={p} renewHref={renewHref(p)} />)}
      </div>

      {!anyKey && (
        <Card className="flex flex-col items-start gap-3 p-6">
          <h2 className="font-semibold">Crea tu primera API key</h2>
          <p className="text-sm text-[var(--muted)]">Una key para una API, o una para todas. Puedes crear varias.</p>
          <ButtonLink href="/dashboard/keys">
            Crear API key <ArrowRight size={16} />
          </ButtonLink>
        </Card>
      )}

      {offers.map((b) => <BundleOffer key={b.id} bundle={b} />)}
    </div>
  );
}
