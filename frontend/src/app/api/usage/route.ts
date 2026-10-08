import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { currentPeriod } from '@/lib/period';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'No autenticado' }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id, enabled: true },
    include: { counters: { where: { period: currentPeriod() } } },
  });

  let used = 0;
  let limit: number | null = 0;
  for (const k of keys) {
    used += k.counters[0]?.used ?? 0;
    if (k.monthlyLimit === null) limit = null;
    else if (limit !== null) limit += k.monthlyLimit;
  }

  return NextResponse.json({ period: currentPeriod(), used, limit, activeKeys: keys.length });
}
