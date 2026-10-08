import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

const schema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(300).optional(),
});

// Valida o rechaza un pago. Al aprobar, amplía la cuota de las keys del usuario
// para ese producto al límite del plan pagado (crea una key si no tiene).
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
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id },
        data: { status: 'approved', note: note ?? null, reviewedBy: admin.email, reviewedAt: new Date() },
      });
      // Amplía la cuota de las keys del usuario para ese producto (o 'all').
      await tx.apiKey.updateMany({
        where: { userId: payment.userId, enabled: true, product: { in: [payment.product, 'all'] } },
        data: { monthlyLimit: payment.monthlyLimit },
      });
    });
  } else {
    await prisma.payment.update({
      where: { id },
      data: { status: 'rejected', note: note ?? null, reviewedBy: admin.email, reviewedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
