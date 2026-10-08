import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { getPlan, PRODUCTS } from '@/lib/plans';

// Planes de los clientes: los activa un pago aprobado o el admin a mano.
export async function GET() {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ message: 'Prohibido' }, { status: 403 });

  const subs = await prisma.subscription.findMany({
    orderBy: [{ updatedAt: 'desc' }],
    include: { user: { select: { email: true, name: true } } },
    take: 500,
  });
  return NextResponse.json({
    subscriptions: subs.map((s) => ({
      id: s.id, product: s.product, plan: s.plan, monthlyLimit: s.monthlyLimit, expiresAt: s.expiresAt,
      userEmail: s.user.email, userName: s.user.name,
    })),
  });
}

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  product: z.enum(PRODUCTS),
  // "free" quita el plan (vuelve al gratis).
  plan: z.string().trim().min(1),
  // Meses desde hoy; 0 = sin vencimiento.
  months: z.number().int().min(0).max(24),
});

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ message: 'Prohibido' }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Datos inválidos' }, { status: 400 });
  const { email, product, plan: planId, months } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ message: `No hay una cuenta con el correo ${email}` }, { status: 404 });

  const where = { userId_product: { userId: user.id, product } };
  if (planId === 'free') {
    await prisma.subscription.deleteMany({ where: { userId: user.id, product } });
    return NextResponse.json({ ok: true });
  }
  const plan = getPlan(product, planId);
  if (!plan) return NextResponse.json({ message: 'Plan inválido' }, { status: 400 });

  let expiresAt: Date | null = null;
  if (months > 0) {
    expiresAt = new Date();
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + months);
  }
  await prisma.subscription.upsert({
    where,
    create: { userId: user.id, product, plan: plan.id, monthlyLimit: plan.monthlyLimit, expiresAt },
    update: { plan: plan.id, monthlyLimit: plan.monthlyLimit, expiresAt },
  });
  return NextResponse.json({ ok: true });
}
