import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { grantPlans, paymentItems } from '@/lib/subscriptions';

const schema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(300).optional(),
});

// Valida o rechaza un pago. Al aprobar, activa por un mes los planes que compró
// (uno, o los de un pack): la cuota de cada API es la de su plan.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ message: 'Prohibido' }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Datos inválidos' }, { status: 400 });

  const { id } = await params;
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) return NextResponse.json({ message: 'No encontrado' }, { status: 404 });
  if (payment.status !== 'pending') {
    return NextResponse.json({ message: 'Este pago ya fue revisado' }, { status: 409 });
  }

  const { action, note } = parsed.data;

  if (action === 'approve') {
    // Solo si sigue pendiente: dos aprobaciones a la vez no suman dos meses.
    const approved = await prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'approved', note: note ?? null, reviewedBy: admin.email, reviewedAt: new Date() },
      });
      if (count === 1) await grantPlans(tx, payment.userId, paymentItems(payment));
      return count === 1;
    });
    if (!approved) return NextResponse.json({ message: 'Este pago ya fue revisado' }, { status: 409 });
  } else {
    await prisma.payment.update({
      where: { id },
      data: { status: 'rejected', note: note ?? null, reviewedBy: admin.email, reviewedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
