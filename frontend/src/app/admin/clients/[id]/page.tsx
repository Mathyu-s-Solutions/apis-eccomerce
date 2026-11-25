import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail } from 'lucide-react';
import { clientOption, getClient, getClientRequests, REQUEST_LOG_DAYS } from '@/lib/admin';
import { renewalMessage } from '@/lib/admin-messages';
import { HUB } from '@/lib/brands';
import { groupByBundle, PRODUCT_NAME, PRODUCTS, purchaseOf, renewalPurchase } from '@/lib/plans';
import { formatDate, formatNumber, formatSoles } from '@/lib/utils';
import { formatPhone } from '@/lib/whatsapp';
import { buttonClasses } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/primitives';
import { ApiName, Avatar, Empty, WhatsAppLink } from '@/components/admin/parts';
import { ClientApiUsage } from '@/components/admin/api-usage';
import { ClientKeys } from '@/components/admin/client-keys';
import { ClientPlanCard } from '@/components/admin/client-plan-card';
import { ClientProfile } from '@/components/admin/client-profile';
import { PaymentCard } from '@/components/admin/payment-card';
import { RegisterPaymentButton } from '@/components/admin/register-payment';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const client = await getClient((await params).id);
  return { title: client ? (client.name ?? client.email) : 'Cliente' };
}

/** "202611" → "nov. 2026" */
function periodLabel(period: string): string {
  const date = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(4)) - 1, 15));
  return new Intl.DateTimeFormat('es-PE', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

const STATUS = {
  paid: { label: 'De pago', tone: 'accent' },
  lapsed: { label: 'Plan vencido', tone: 'danger' },
  trial: { label: 'En prueba', tone: 'neutral' },
} as const;

export default async function AdminClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ route?: string; errors?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const filter = { route: typeof query.route === 'string' && query.route ? query.route : undefined, errorsOnly: query.errors === '1' };
  const [client, requests] = await Promise.all([getClient(id), getClientRequests(id, filter)]);
  if (!client) notFound();
  const option = clientOption(client);

  // WhatsApp: si su plan vence pronto, el recordatorio para renovar; si no, un saludo.
  const now = new Date();
  // Lo que vence primero (vigente en 7 días o ya vencido): su pack completo o su plan.
  const due = groupByBundle(client.subs.filter((s) => s.paid && s.expiresAt))
    .map((g) => ({ g, at: g.subs.map((s) => s.expiresAt!).sort()[0] }))
    .filter(({ g, at }) => new Date(at).getTime() - now.getTime() < 7 * 86_400_000 && (g.subs.every((s) => s.active) || client.status === 'lapsed'))
    .sort((a, b) => a.at.localeCompare(b.at))[0];
  const duePurchase = due && purchaseOf(renewalPurchase(due.g.subs) ?? '');
  const reminderAt = duePurchase ? due.at : undefined;
  const message = reminderAt && duePurchase
    ? renewalMessage(client.name, duePurchase.name, reminderAt, duePurchase.pricedPen)
    : `Hola${client.name ? ` ${client.name.split(' ')[0]}` : ''}, te escribo de ${HUB.name}.`;
  const keysFor = (p: string) => client.keys.filter((k) => k.enabled && (k.product === p || k.product === 'all')).length;
  const status = STATUS[client.status];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/clients" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          <ArrowLeft size={15} /> Clientes
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={client.name} email={client.email} className="h-14 w-14 text-base" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight">{client.name ?? client.email}</h1>
                <Badge tone={status.tone}>{status.label}</Badge>
                {client.isAdmin && <Badge>Admin</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                {client.email}{client.phone ? ` · ${formatPhone(client.phone)}` : ''}
              </p>
              <p className="text-xs text-[var(--muted)]">
                Cliente desde el {formatDate(client.createdAt)} · {client.paidTotal > 0 ? `pagó ${formatSoles(client.paidTotal)} en total` : 'sin pagos todavía'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {client.phone && <WhatsAppLink phone={client.phone} text={message} label={reminderAt ? 'Recordarle por WhatsApp' : 'WhatsApp'} />}
            <a href={`mailto:${client.email}`} className={buttonClasses('outline', 'sm', 'h-8 px-2.5 text-xs')}>
              <Mail size={14} /> Correo
            </a>
            <RegisterPaymentButton client={option} size="sm" />
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-semibold">Planes y consumo del mes</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {PRODUCTS.map((p) => (
            <ClientPlanCard key={p} client={option} subs={client.subs} product={p} used={client.used[p] ?? 0} keys={keysFor(p)} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Uso de la API (últimos {REQUEST_LOG_DAYS} días)</h2>
        <ClientApiUsage data={requests} filter={filter} base={`/admin/clients/${client.id}`} days={REQUEST_LOG_DAYS} />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h2 className="mb-3 font-semibold">Pagos</h2>
          <Card className="divide-y divide-[var(--border)] overflow-hidden">
            {client.payments.length === 0
              ? <Empty>Sin pagos. Si te pagó por fuera, usa «Registrar pago».</Empty>
              : client.payments.map((p) => <PaymentCard key={p.id} payment={p} showClient={false} />)}
          </Card>
        </section>

        <div className="min-w-0 space-y-8">
          <section>
            <ClientProfile id={client.id} name={client.name} phone={client.phone} note={client.note} />
          </section>
          <section>
            <h2 className="mb-3 font-semibold">Consumo de los últimos meses</h2>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                    <th scope="col" className="px-4 py-2.5 font-medium">Mes</th>
                    {PRODUCTS.map((p) => <th key={p} scope="col" className="px-4 py-2.5 text-right font-medium"><ApiName product={p} className="justify-end" /></th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {client.history.map((h) => (
                    <tr key={h.period}>
                      <th scope="row" className="px-4 py-2 text-left font-normal text-[var(--muted)]">{periodLabel(h.period)}</th>
                      {PRODUCTS.map((p) => (
                        <td key={p} className="px-4 py-2 text-right tabular-nums">
                          {h.used[p] ? formatNumber(h.used[p]) : <span className="text-[var(--muted)]">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="sr-only">Consultas por mes de {PRODUCTS.map((p) => PRODUCT_NAME[p]).join(', ')}.</p>
            </Card>
          </section>
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-semibold">API keys</h2>
        <ClientKeys keys={client.keys} />
      </section>
    </div>
  );
}
