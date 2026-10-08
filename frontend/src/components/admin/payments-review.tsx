'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, Badge, Textarea } from '@/components/ui/primitives';
import { formatDateTime, formatNumber, formatSoles } from '@/lib/utils';

interface AdminPayment {
  id: string;
  product: string;
  plan: string;
  amountPen: number;
  monthlyLimit: number | null;
  method: string;
  operationCode: string | null;
  status: string;
  note: string | null;
  createdAt: string;
  userEmail: string;
  userName: string | null;
}

const STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'Pendiente', tone: 'warning' },
  approved: { label: 'Aprobado', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'danger' },
};

export function PaymentsReview() {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [items, setItems] = useState<AdminPayment[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    const qs = filter === 'pending' ? '?status=pending' : '';
    const res = await fetch(`/api/admin/payments${qs}`);
    const data = await res.json();
    setItems(data.payments ?? []);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: 'approve' | 'reject') {
    setBusy(id);
    try {
      await fetch(`/api/admin/payments/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, note: notes[id] || undefined }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl border border-[var(--border)] p-1">
        {(['pending', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === f ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)]'}`}
          >
            {f === 'pending' ? 'Pendientes' : 'Todos'}
          </button>
        ))}
      </div>

      {items === null ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
      ) : items.length === 0 ? (
        <Card className="p-6 text-sm text-[var(--muted)]">No hay pagos {filter === 'pending' ? 'pendientes' : ''}.</Card>
      ) : (
        items.map((p) => {
          const s = STATUS[p.status] ?? STATUS.pending;
          return (
            <Card key={p.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.userName ?? p.userEmail}</span>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  <p className="text-sm text-[var(--muted)]">{p.userEmail}</p>
                  <p className="mt-2 text-sm">
                    <span className="capitalize">{p.product}</span> · plan <b>{p.plan}</b> · {formatSoles(p.amountPen)} · {p.method}
                    {p.operationCode ? ` · Op. ${p.operationCode}` : ''}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {formatDateTime(p.createdAt)} · nueva cuota: {formatNumber(p.monthlyLimit)}
                  </p>
                  <a
                    href={`/api/payments/${p.id}/proof`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)]"
                  >
                    Ver comprobante <ExternalLink size={14} />
                  </a>
                </div>

                {p.status === 'pending' && (
                  <div className="w-full max-w-xs space-y-2">
                    <Textarea
                      rows={2}
                      placeholder="Nota (opcional)"
                      value={notes[p.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => act(p.id, 'approve')} disabled={busy === p.id}>
                        <Check size={15} /> Aprobar
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => act(p.id, 'reject')} disabled={busy === p.id}>
                        <X size={15} /> Rechazar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              {p.status !== 'pending' && p.note && (
                <p className="mt-2 text-xs text-[var(--muted)]">Nota: {p.note}</p>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
