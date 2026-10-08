import { prisma } from '@/lib/db';
import { formatDateTime, formatSoles } from '@/lib/utils';
import { Card, Badge } from '@/components/ui/primitives';

const STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'Pendiente', tone: 'warning' },
  approved: { label: 'Aprobado', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'danger' },
};

export async function PaymentHistory({ userId }: { userId: string }) {
  const payments = await prisma.payment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  if (payments.length === 0) {
    return <Card className="p-6 text-sm text-[var(--muted)]">Todavía no has registrado pagos.</Card>;
  }

  return (
    <div className="space-y-3">
      {payments.map((p) => {
        const s = STATUS[p.status] ?? STATUS.pending;
        return (
          <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">{p.product} · {p.plan}</span>
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {formatDateTime(p.createdAt)} · {p.method}{p.operationCode ? ` · Op. ${p.operationCode}` : ''}
              </p>
              {p.note && <p className="mt-1 text-xs text-[var(--muted)]">Nota: {p.note}</p>}
            </div>
            <span className="font-semibold">{formatSoles(p.amountPen)}</span>
          </Card>
        );
      })}
    </div>
  );
}
