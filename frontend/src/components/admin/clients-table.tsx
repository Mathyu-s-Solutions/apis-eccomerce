'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import type { ClientRow, SubView } from '@/lib/admin';
import { freePlan, groupByBundle, PRODUCT_NAME, PRODUCTS } from '@/lib/plans';
import { cn, formatDate, formatNumber, formatSoles } from '@/lib/utils';
import { Badge, Card, Input } from '@/components/ui/primitives';
import { Avatar, Empty, WhatsAppLink } from './parts';

type Filter = 'all' | 'paid' | 'expiring' | 'lapsed' | 'trial';
const DAY_MS = 86_400_000;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'paid', label: 'De pago' },
  { value: 'expiring', label: 'Vencen en 7 días' },
  { value: 'lapsed', label: 'Vencidos' },
  { value: 'trial', label: 'En prueba' },
];

/** Sus planes como los compra (un pack junto), con el vencimiento. */
export function PlanBadges({ subs, now }: { subs: SubView[]; now: number }) {
  const groups = groupByBundle(subs.filter((s) => s.paid));
  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((g) => {
        const first = g.subs[0];
        const expiry = g.subs.map((s) => s.expiresAt).filter((d): d is string => !!d).sort()[0];
        const active = g.subs.every((s) => s.active);
        const soon = active && expiry && new Date(expiry).getTime() - now < 7 * DAY_MS;
        return (
          <span key={g.bundle?.id ?? first.product} className="inline-flex flex-wrap items-center gap-1.5">
            <Badge tone={active ? 'accent' : 'danger'}>{g.bundle ? g.bundle.name : `${PRODUCT_NAME[first.product]} ${first.planName}`}</Badge>
            <span className={cn('text-xs', !active ? 'text-red-700' : soon ? 'font-medium text-amber-700' : 'text-[var(--muted)]')}>
              {expiry ? `${active ? 'vence' : 'venció'} ${formatDate(expiry)}` : 'sin vencimiento'}
            </span>
          </span>
        );
      })}
    </>
  );
}

/** Lo que usa en prueba este mes: "Shalom 12/20 · Olva 3/20". */
function trialUsage(c: ClientRow): string | null {
  const parts = PRODUCTS.flatMap((p) => {
    const sub = c.subs.find((s) => s.product === p && s.active);
    if (sub?.paid) return [];
    const used = c.used[p] ?? 0;
    if (!used && !c.keyProducts.includes(p) && !sub) return [];
    const limit = sub ? sub.monthlyLimit : freePlan(p).monthlyLimit;
    return [`${PRODUCT_NAME[p]} ${formatNumber(used)}/${formatNumber(limit)}`];
  });
  return parts.length ? parts.join(' · ') : null;
}

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [now] = useState(() => Date.now());

  const matches = useMemo(() => {
    const test: Record<Filter, (c: ClientRow) => boolean> = {
      all: () => true,
      paid: (c) => c.status === 'paid',
      expiring: (c) => !!c.nextExpiry && new Date(c.nextExpiry).getTime() - now < 7 * DAY_MS,
      lapsed: (c) => c.status === 'lapsed',
      trial: (c) => c.status === 'trial',
    };
    return test;
  }, [now]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.value, clients.filter(matches[f.value]).length])) as Record<Filter, number>, [clients, matches]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const list = clients.filter((c) =>
      matches[filter](c) &&
      (!q || c.email.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q) || (digits.length >= 3 && c.phone?.includes(digits))),
    );
    if (filter === 'expiring') list.sort((a, b) => (a.nextExpiry ?? '').localeCompare(b.nextExpiry ?? ''));
    return list;
  }, [clients, query, filter, matches]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Filtrar clientes" className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium',
                filter === f.value ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]',
              )}
            >
              {f.label}
              <span className="rounded-full bg-[var(--surface)] px-1.5 text-xs tabular-nums">{counts[f.value]}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:w-72">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, correo o WhatsApp" aria-label="Buscar clientes" className="h-10 pl-10" />
        </div>
      </div>

      <Card className="divide-y divide-[var(--border)] overflow-hidden">
        {rows.length === 0 ? (
          <Empty>{clients.length === 0 ? 'Todavía no hay clientes registrados.' : 'Nadie coincide con ese filtro.'}</Empty>
        ) : (
          rows.map((c) => {
            const trial = trialUsage(c);
            return (
              <div key={c.id} className="group relative flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface)] sm:px-5">
                <Avatar name={c.name} email={c.email} />
                <div className="grid min-w-0 flex-1 gap-x-6 gap-y-1.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {/* El link cubre toda la fila; los botones van encima. */}
                      <Link href={`/admin/clients/${c.id}`} className="truncate font-medium after:absolute after:inset-0">
                        {c.name ?? c.email}
                      </Link>
                      {c.isAdmin && <Badge>Admin</Badge>}
                      {c.pendingPayments > 0 && <Badge tone="warning">{c.pendingPayments} por validar</Badge>}
                    </div>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {c.name ? `${c.email} · ` : ''}desde {formatDate(c.createdAt)}
                      {c.paidTotal > 0 ? ` · pagó ${formatSoles(c.paidTotal)}` : ''}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <PlanBadges subs={c.subs} now={now} />
                    {trial ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Badge>Prueba</Badge>
                        <span className="text-xs text-[var(--muted)]">{trial}</span>
                      </span>
                    ) : c.status === 'trial' && c.activeKeys === 0 ? (
                      <span className="text-xs text-[var(--muted)]">Sin API keys todavía</span>
                    ) : null}
                  </div>
                </div>
                <div className="relative z-10 flex shrink-0 items-center gap-2">
                  {c.phone && <WhatsAppLink phone={c.phone} compact />}
                  <ChevronRight size={18} className="text-[var(--muted)] group-hover:text-[var(--foreground)]" />
                </div>
              </div>
            );
          })
        )}
      </Card>
      {rows.length > 0 && (
        <p className="text-xs text-[var(--muted)]">{rows.length} de {clients.length} clientes</p>
      )}
    </div>
  );
}
