import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ message: 'Prohibido' }, { status: 403 });

  const status = new URL(request.url).searchParams.get('status') ?? undefined;
  const payments = await prisma.payment.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { user: { select: { email: true, name: true } } },
    take: 200,
  });

  return NextResponse.json({
    payments: payments.map((p) => ({
      id: p.id, product: p.product, plan: p.plan, amountPen: p.amountPen,
      monthlyLimit: p.monthlyLimit, method: p.method, operationCode: p.operationCode,
      status: p.status, note: p.note, createdAt: p.createdAt, reviewedAt: p.reviewedAt,
      userEmail: p.user.email, userName: p.user.name,
    })),
  });
}
