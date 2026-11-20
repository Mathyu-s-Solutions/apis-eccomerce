import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, Search } from 'lucide-react';
import { listPayments, paymentCounts, type PaymentFilter } from '@/lib/admin';
import { cn, formatSoles } from '@/lib/utils';
import { buttonClasses } from '@/components/ui/button';
import { Card, Input } from '@/components/ui/primitives';
import { Empty, PageHeader } from '@/components/admin/parts';
import { PaymentCard } from '@/components/admin/payment-card';

export const metadata: Metadata = { title: 'Pagos' };

const TABS: { value: PaymentFilter; label: string }[] = [
  { value: 'pending', label: 'Por validar' },
  { value: 'approved', label: 'Aprobados' },
  { value: 'rejected', label: 'Rechazados' },
  { value: 'all', label: 'Todos' },
];

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const params = await searchParams;
  const status = TABS.find((t) => t.value === params.status)?.value ?? 'pending';
  const q = (params.q ?? '').trim();
  const [payments, counts] = await Promise.all([listPayments(status, q), paymentCounts()]);
  const href = (s: PaymentFilter) => `/admin/payments?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const total = payments.filter((p) => p.status === 'approved').reduce((sum, p) => sum + p.amountPen, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos"
        description="Valida los comprobantes que suben los clientes: al aprobar se activa su plan y le llega un correo. Si te pagaron por WhatsApp, usa «Registrar pago» (arriba a la derecha)."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Estado" className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] p-1">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={href(t.value)}
              aria-current={status === t.value ? 'page' : undefined}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium',
                status === t.value ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]',
              )}
            >
              {t.label}
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', t.value === 'pending' && counts.pending > 0 ? 'bg-amber-500 text-white' : 'bg-[var(--surface)]')}>
                {counts[t.value]}
              </span>
            </Link>
          ))}
        </nav>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <form action="/admin/payments" className="relative w-full sm:w-64">
            <input type="hidden" name="status" value={status} />
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <Input name="q" defaultValue={q} placeholder="Cliente o N° de operación" aria-label="Buscar pagos" className="h-9 pl-10" />
          </form>
          <a href={`/api/admin/payments/export?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={buttonClasses('outline', 'sm', 'h-9')}>
            <Download size={15} /> CSV
          </a>
        </div>
      </div>

      {q && (
        <p className="text-sm text-[var(--muted)]">
          {payments.length} {payments.length === 1 ? 'resultado' : 'resultados'} para «{q}» ·{' '}
          <Link href={`/admin/payments?status=${status}`} className="font-medium text-[var(--accent)] hover:underline">Quitar búsqueda</Link>
        </p>
      )}

      <Card className="divide-y divide-[var(--border)] overflow-hidden">
        {payments.length === 0 ? (
          <Empty>
            {status === 'pending' && !q ? 'Todo al día: no hay pagos por validar.' : 'No hay pagos con ese filtro.'}
          </Empty>
        ) : (
          payments.map((p) => <PaymentCard key={p.id} payment={p} />)
        )}
      </Card>

      {status !== 'pending' && status !== 'rejected' && payments.length > 0 && (
        <p className="text-right text-sm text-[var(--muted)]">
          Aprobados en esta lista: <b className="text-[var(--foreground)] tabular-nums">{formatSoles(total)}</b>
          {payments.length >= 300 ? ' (los 300 más recientes; el CSV trae todos)' : ''}
        </p>
      )}
    </div>
  );
}
