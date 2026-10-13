import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { getBundle, getPlan, isProduct, type Product } from '@/lib/plans';
import { addMonthsKeepingDay, endOfLimaDay } from '@/lib/renewal';

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
  // Una API ("shalom") o un pack ("bundle:couriers-basico", que asigna sus planes).
  product: z.string().trim().min(1),
  // "free" quita el plan (vuelve al gratis). En un pack no se usa.
  plan: z.string().trim().min(1),
  // Meses desde hoy; 0 = sin vencimiento. Se ignora si viene `until`.
  months: z.number().int().min(0).max(24),
  // Vence al final de ese día (hora de Lima) y se renueva ese mismo día cada mes.
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ message: 'Prohibido' }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Datos inválidos' }, { status: 400 });
  const { email, product, plan: planId, months, until } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ message: `No hay una cuenta con el correo ${email}` }, { status: 404 });

  const bundle = product.startsWith('bundle:') ? getBundle(product.slice('bundle:'.length)) : undefined;
  if (product.startsWith('bundle:') && !bundle) return NextResponse.json({ message: 'Pack inválido' }, { status: 400 });
  if (!bundle && !isProduct(product)) return NextResponse.json({ message: 'API inválida' }, { status: 400 });

  if (!bundle && planId === 'free') {
    await prisma.subscription.deleteMany({ where: { userId: user.id, product } });
    return NextResponse.json({ ok: true });
  }

  let expiresAt: Date | null = null;
  if (until) {
    expiresAt = endOfLimaDay(until);
    if (expiresAt <= new Date()) return NextResponse.json({ message: 'La fecha de vencimiento ya pasó' }, { status: 400 });
  } else if (months > 0) {
    expiresAt = addMonthsKeepingDay(new Date(), months);
  }

  const items = bundle ? bundle.items : [{ product: product as Product, plan: planId }];
  for (const item of items) {
    const plan = getPlan(item.product, item.plan);
    if (!plan) return NextResponse.json({ message: 'Plan inválido' }, { status: 400 });
  }
  await prisma.$transaction(
    items.map((item) => {
      const plan = getPlan(item.product, item.plan)!;
      return prisma.subscription.upsert({
        where: { userId_product: { userId: user.id, product: item.product } },
        create: { userId: user.id, product: item.product, plan: plan.id, monthlyLimit: plan.monthlyLimit, expiresAt },
        update: { plan: plan.id, monthlyLimit: plan.monthlyLimit, expiresAt },
      });
    }),
  );
  return NextResponse.json({ ok: true });
}
