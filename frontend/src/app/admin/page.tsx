import Link from 'next/link';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import { clientOption, getOverview, getRecentFailures } from '@/lib/admin';
import { renewalMessage, upgradeMessage } from '@/lib/admin-messages';
import { getPlan, PRODUCT_NAME, purchaseOf } from '@/lib/plans';
import { relativeExpiry } from '@/lib/renewal';
import { cn, formatDate, formatNumber, formatSoles } from '@/lib/utils';
import { Badge, Card } from '@/components/ui/primitives';
import { ApiName, Avatar, Empty, PageHeader, StatTile, WhatsAppLink } from '@/components/admin/parts';
import { RecentFailures } from '@/components/admin/api-usage';
import { PaymentCard } from '@/components/admin/payment-card';
import { RegisterPaymentButton } from '@/components/admin/register-payment';
import { RevenueChart } from '@/components/admin/revenue-chart';


function SectionTitle({ title, href, link }: { title: string; href?: string; link?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-semibold">{title}</h2>
      {href && <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline">{link} <ArrowRight size={14} /></Link>}
    </div>
  );
}

const FAILURE_HOURS = 24;

export default async function AdminHome() {
  const now = new Date();
  const [o, failures] = await Promise.all([getOverview(now), getRecentFailures(FAILURE_HOURS)]);
  // En minúscula: es-PE da "Noviembre" para el mes solo.
  const month = new Intl.DateTimeFormat('es-PE', { month: 'long', timeZone: 'America/Lima' }).format(now).toLowerCase();
  const delta = o.revenue.month - o.revenue.prevMonth;

  return (
    <div className="space-y-8">
      <PageHeader title="Resumen" description={`Cómo va ${month}: ingresos, pagos por validar, planes por vencer y quién está por agotar su prueba.`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          className="sm:col-span-2 lg:row-span-2"
          label={`Ingresos de ${month}`}
          value={formatSoles(o.revenue.month)}
          hint={
            <span className="flex flex-wrap items-center gap-x-2">
              <span>{o.revenue.payments} {o.revenue.payments === 1 ? 'pago aprobado' : 'pagos aprobados'}</span>
              {o.revenue.prevMonth > 0 || o.revenue.month > 0 ? (
                <span className={cn('inline-flex items-center gap-0.5 font-medium', delta >= 0 ? 'text-green-700' : 'text-red-700')}>
                  {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {delta >= 0 ? '+' : '−'}{formatSoles(Math.abs(delta))} vs. mes pasado
                </span>
              ) : null}
            </span>
          }
        >
          <RevenueChart series={o.revenue.series} />
        </StatTile>
        <StatTile label="Recurrente estimado" value={`${formatSoles(o.recurring)}/mes`} hint="Si todos renuevan lo que tienen hoy" />
        <StatTile label="Clientes de pago" value={formatNumber(o.clients.paid)} hint={`${o.clients.lapsed} con el plan vencido · ${o.clients.total} registrados`} />
        <StatTile label="Probando gratis" value={formatNumber(o.clients.trialUsing)} hint="Sin plan, con keys o consumo este mes" />
        <StatTile label={`Nuevos en ${month}`} value={formatNumber(o.clients.newThisMonth)} hint={<Link href="/admin/clients" className="text-[var(--accent)] hover:underline">Ver clientes</Link>} />
      </div>

      {o.pendingTotal > 0 && (
        <section>
          <SectionTitle title={`Por validar (${o.pendingTotal})`} href="/admin/payments" link={o.pendingTotal > o.pending.length ? `Ver los ${o.pendingTotal}` : 'Ir a pagos'} />
          <Card className="divide-y divide-[var(--border)] overflow-hidden border-amber-200">
            {o.pending.map((p) => <PaymentCard key={p.id} payment={p} />)}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle title={`Fallas de la API (últimas ${FAILURE_HOURS} h)`} href="/status" link="Página de estado" />
        <RecentFailures groups={failures} hours={FAILURE_HOURS} />
      </section>

      <div className="grid gap-8 xl:grid-cols-2">
        <section className="min-w-0">
          <SectionTitle title="Vencen pronto" href="/admin/clients" link="Clientes" />
          <Card className="divide-y divide-[var(--border)] overflow-hidden">
            {o.expiring.length === 0 ? (
              <Empty>Nadie vence en los próximos 7 días.</Empty>
            ) : (
              o.expiring.map((e) => {
                const price = e.purchase ? purchaseOf(e.purchase)?.pricedPen ?? null : null;
                return (
                  <div key={`${e.client.id}:${e.name}`} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                    <Avatar name={e.client.name} email={e.client.email} />
                    <div className="min-w-0 flex-1 text-sm">
                      <Link href={`/admin/clients/${e.client.id}`} className="block truncate font-medium hover:underline">{e.client.name ?? e.client.email}</Link>
                      <p className="text-xs text-[var(--muted)]">
                        {e.name} · {e.overdue ? 'venció' : 'vence'} el {formatDate(e.expiresAt)}{' '}
                        <span className={e.overdue ? 'font-medium text-red-700' : 'font-medium text-amber-700'}>({relativeExpiry(new Date(e.expiresAt), now)})</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {e.client.phone && <WhatsAppLink phone={e.client.phone} text={renewalMessage(e.client.name, e.name, e.expiresAt, price)} label="Recordar" />}
                      <RegisterPaymentButton client={clientOption(e.client)} purchase={e.purchase} size="sm" variant="outline" className="h-8 px-2.5 text-xs">
                        Renovar
                      </RegisterPaymentButton>
                    </div>
                  </div>
                );
              })
            )}
          </Card>
        </section>

        <section className="min-w-0">
          <SectionTitle title="Por agotar su prueba" />
          <Card className="divide-y divide-[var(--border)] overflow-hidden">
            {o.trialHot.length === 0 ? (
              <Empty>Nadie está cerca del límite de prueba este mes.</Empty>
            ) : (
              o.trialHot.map((t) => {
                const pct = Math.min(100, Math.round((t.used / t.limit) * 100));
                return (
                  <div key={`${t.client.id}:${t.product}`} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                    <Avatar name={t.client.name} email={t.client.email} />
                    <div className="min-w-0 flex-1 text-sm">
                      <Link href={`/admin/clients/${t.client.id}`} className="block truncate font-medium hover:underline">{t.client.name ?? t.client.email}</Link>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                        <ApiName product={t.product} className="font-normal" />
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--accent-soft)]" aria-hidden>
                          <span className={cn('block h-full rounded-full', pct >= 100 ? 'bg-red-500' : 'bg-amber-500')} style={{ width: `${pct}%` }} />
                        </span>
                        <span className="tabular-nums">{formatNumber(t.used)}/{formatNumber(t.limit)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.client.phone && (
                        <WhatsAppLink phone={t.client.phone} text={upgradeMessage(t.client.name, PRODUCT_NAME[t.product], t.used, t.limit, getPlan(t.product, 'basico'))} label="Ofrecer plan" />
                      )}
                      <Link href={`/admin/clients/${t.client.id}`} className="inline-flex h-8 items-center rounded-xl border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface)]">
                        Subir cuota
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </Card>
        </section>
      </div>

      <section>
        <SectionTitle title="Últimos registros" href="/admin/clients" link="Todos los clientes" />
        <Card className="divide-y divide-[var(--border)] overflow-hidden">
          {o.recent.length === 0 ? (
            <Empty>Todavía no hay clientes.</Empty>
          ) : (
            o.recent.map((c) => (
              <Link key={c.id} href={`/admin/clients/${c.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--surface)] sm:px-5">
                <Avatar name={c.name} email={c.email} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name ?? c.email}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{c.name ? `${c.email} · ` : ''}{formatDate(c.createdAt)}</p>
                </div>
                <Badge tone={c.status === 'paid' ? 'accent' : c.status === 'lapsed' ? 'danger' : 'neutral'}>
                  {c.status === 'paid' ? 'De pago' : c.status === 'lapsed' ? 'Vencido' : c.activeKeys > 0 ? 'Probando' : 'Sin keys'}
                </Badge>
              </Link>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
