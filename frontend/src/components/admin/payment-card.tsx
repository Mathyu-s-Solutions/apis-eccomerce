'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, FileText, Loader2, X } from 'lucide-react';
import type { PaymentView } from '@/lib/admin';
import { paymentMethodLabel, PRODUCT_NAME, getPlan } from '@/lib/plans';
import { formatDateTime, formatSoles, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Input } from '@/components/ui/primitives';
import { Avatar } from './parts';
import { useAdminAction } from './toast';

const STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'Por validar', tone: 'warning' },
  approved: { label: 'Aprobado', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'danger' },
};

/** "Shalom Básico + Olva Básico · 3 meses" */
function itemsText(p: PaymentView): string {
  const months = p.items[0]?.months ?? 1;
  const plans = p.items.map((i) => `${PRODUCT_NAME[i.product]} ${getPlan(i.product, i.plan)?.name ?? i.plan}`).join(' + ');
  return `${plans} · ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

/** Un pago: datos, comprobante y, si está por validar, aprobar o rechazar. */
export function PaymentCard({ payment: p, showClient = true }: { payment: PaymentView; showClient?: boolean }) {
  const run = useAdminAction();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [viewing, setViewing] = useState(false);
  const status = STATUS[p.status] ?? STATUS.pending;
  const proofUrl = `/api/payments/${p.id}/proof`;

  async function act(action: 'approve' | 'reject') {
    setBusy(action);
    await run(
      `/api/admin/payments/${p.id}`,
      { json: { action, note: action === 'reject' ? reason.trim() || undefined : undefined } },
      action === 'approve' ? `Aprobado: ${p.label} activo para ${p.user.name ?? p.user.email}.` : 'Pago rechazado. Le avisamos por correo.',
    );
    setBusy(null);
  }

  return (
    <div className={cn('flex flex-col gap-4 p-4 sm:flex-row sm:p-5', p.status === 'pending' && 'bg-amber-50/40')}>
      {/* Comprobante */}
      {p.proof === 'image' ? (
        <button type="button" onClick={() => setViewing(true)} className="group relative h-24 w-full shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] sm:w-20" aria-label="Ver comprobante">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API (no pasa por el optimizador) */}
          <img src={proofUrl} alt="" loading="lazy" className="h-full w-full object-cover object-top transition-transform group-hover:scale-105" />
        </button>
      ) : p.proof === 'pdf' ? (
        <a href={proofUrl} target="_blank" rel="noreferrer" className="flex h-24 w-full shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--muted)] hover:text-[var(--foreground)] sm:w-20">
          <FileText size={20} /> PDF
        </a>
      ) : (
        <div className="hidden h-24 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--border)] px-2 text-center text-[11px] leading-tight text-[var(--muted)] sm:flex">
          Sin comprobante
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {showClient && (
            <Link href={`/admin/clients/${p.user.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
              <Avatar name={p.user.name} email={p.user.email} className="h-7 w-7 text-[10px]" />
              <span className="truncate font-medium">{p.user.name ?? p.user.email}</span>
            </Link>
          )}
          <Badge tone={status.tone}>{status.label}</Badge>
          <span className="text-xs text-[var(--muted)]">{formatDateTime(p.createdAt)}</span>
        </div>
        {showClient && p.user.name && <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{p.user.email}</p>}

        <p className="mt-2 text-sm">
          <span className="text-lg font-semibold tabular-nums">{formatSoles(p.amountPen)}</span>
          <span className="text-[var(--muted)]"> · </span>
          <b>{p.label}</b>
          <span className="text-[var(--muted)]"> · {paymentMethodLabel(p.method)}{p.operationCode ? ` · Op. ${p.operationCode}` : ''}</span>
        </p>
        <p className="text-xs text-[var(--muted)]">{p.status === 'pending' ? 'Al aprobar activa: ' : 'Activó: '}{itemsText(p)}</p>
        {p.status !== 'pending' && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {p.status === 'approved' ? 'Aprobado' : 'Rechazado'}
            {p.reviewedBy ? ` por ${p.reviewedBy}` : ''}
            {p.reviewedAt ? ` · ${formatDateTime(p.reviewedAt)}` : ''}
            {!p.proof ? ' · registrado a mano' : ''}
          </p>
        )}
        {p.note && <p className="mt-1 text-xs text-[var(--muted)]">Nota: {p.note}</p>}
      </div>

      {p.status === 'pending' && (
        <div className="flex shrink-0 flex-col gap-2 sm:w-56">
          {rejecting ? (
            <>
              <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Motivo (le llega por correo)" className="h-9" />
              <div className="flex gap-2">
                <Button size="sm" variant="danger" className="flex-1" onClick={() => act('reject')} disabled={busy !== null}>
                  {busy === 'reject' ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />} Rechazar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={busy !== null}>Volver</Button>
              </div>
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => act('approve')} disabled={busy !== null}>
                {busy === 'approve' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Aprobar y activar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={busy !== null}>
                <X size={15} /> Rechazar…
              </Button>
            </>
          )}
        </div>
      )}

      {p.proof === 'image' && (
        <Dialog open={viewing} onClose={() => setViewing(false)} title={`Comprobante · ${formatSoles(p.amountPen)}`} description={`${p.user.name ?? p.user.email} · ${p.label}${p.operationCode ? ` · Op. ${p.operationCode}` : ''}`} className="max-w-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API */}
          <img src={proofUrl} alt={`Comprobante del pago de ${p.user.name ?? p.user.email}`} className="mx-auto max-h-[70dvh] w-auto rounded-xl border border-[var(--border)]" />
          <a href={proofUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline">
            Abrir en otra pestaña <ExternalLink size={14} />
          </a>
        </Dialog>
      )}
    </div>
  );
}
