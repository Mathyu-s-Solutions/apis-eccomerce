import Link from 'next/link';
import { KeyRound, Activity, CreditCard, ArrowRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { currentPeriod } from '@/lib/period';
import { formatNumber } from '@/lib/utils';
import { Card } from '@/components/ui/primitives';
import { UsageBar } from '@/components/dashboard/usage-bar';

export default async function DashboardHome() {
  const user = (await getCurrentUser())!;
  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id, enabled: true },
    include: { counters: { where: { period: currentPeriod() } } },
  });

  const used = keys.reduce((a, k) => a + (k.counters[0]?.used ?? 0), 0);
  const unlimited = keys.some((k) => k.monthlyLimit === null);
  const limit = unlimited ? null : keys.reduce((a, k) => a + (k.monthlyLimit ?? 0), 0);
  const pendingPayments = await prisma.payment.count({ where: { userId: user.id, status: 'pending' } });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hola{user.name ? `, ${user.name}` : ''} 👋</h1>
        <p className="mt-1 text-[var(--muted)]">Este es el resumen de tu cuenta.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><KeyRound size={16} /> API keys activas</div>
          <p className="mt-2 text-3xl font-bold">{keys.length}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Activity size={16} /> Consumo del mes</div>
          <p className="mt-2 text-3xl font-bold">{formatNumber(used)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><CreditCard size={16} /> Pagos pendientes</div>
          <p className="mt-2 text-3xl font-bold">{pendingPayments}</p>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Consumo del periodo {currentPeriod()}</h2>
          <Link href="/dashboard/keys" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)]">
            Ver keys <ArrowRight size={14} />
          </Link>
        </div>
        <div className="mt-4">
          <UsageBar used={used} limit={limit} />
        </div>
      </Card>

      {keys.length === 0 && (
        <Card className="flex flex-col items-start gap-3 p-6">
          <h2 className="font-semibold">Crea tu primera API key</h2>
          <p className="text-sm text-[var(--muted)]">Necesitas una key para empezar a llamar a la API.</p>
          <Link href="/dashboard/keys" className="inline-flex items-center gap-1 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--on-primary)] hover:bg-[var(--primary-hover)]">
            Crear API key <ArrowRight size={16} />
          </Link>
        </Card>
      )}
    </div>
  );
}
