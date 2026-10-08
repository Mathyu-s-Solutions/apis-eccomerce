import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { currentPeriod } from '@/lib/period';
import { getAccountPlans } from '@/lib/subscriptions';

// Plan y consumo del mes de cada API del cliente.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'No autenticado' }, { status: 401 });

  const plans = await getAccountPlans(user.id);
  return NextResponse.json({
    period: currentPeriod(),
    apis: plans.map((p) => ({
      product: p.product,
      plan: p.plan.id,
      planName: p.plan.name,
      limit: p.monthlyLimit,
      used: p.used,
      expiresAt: p.expiresAt,
      keys: p.keys,
    })),
  });
}
