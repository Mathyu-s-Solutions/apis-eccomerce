import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { getBundle, getPlan, isProduct, PAYMENT_METHODS, type PaymentItem } from '@/lib/plans';
import { grantPlans, paymentItems, paymentLabel } from '@/lib/subscriptions';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ message: 'Prohibido' }, { status: 403 });

  const status = new URL(request.url).searchParams.get('status') ?? undefined;
  const payments = await prisma.payment.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    omit: { proofData: true },
    include: { user: { select: { email: true, name: true } } },
    take: 200,
  });

  return NextResponse.json({
    payments: payments.map((p) => ({
      id: p.id, product: p.product, plan: p.plan, label: paymentLabel(p), items: paymentItems(p), amountPen: p.amountPen,
      monthlyLimit: p.monthlyLimit, method: p.method, operationCode: p.operationCode,
      status: p.status, note: p.note, createdAt: p.createdAt, reviewedAt: p.reviewedAt,
      // Los que registra el admin a mano no traen comprobante.
      hasProof: p.proofMime !== '',
      userEmail: p.user.email, userName: p.user.name,
    })),
  });
}

const schema = z.object({
  userId: z.string().min(1),
  // Una API ("olva": renueva el plan que tiene) o un pack ("bundle:couriers-basico").
  product: z.string().trim().min(1),
  method: z.string().refine((m) => Object.hasOwn(PAYMENT_METHODS, m)),
  amountPen: z.number().int().min(0).max(100_000),
  operationCode: z.string().trim().max(40).optional(),
});

// Pago que el cliente hizo por fuera (Yape directo, transferencia, efectivo…):
// queda aprobado en su historial y renueva sus planes un mes, como al aprobar
// un comprobante (mismo día de vencimiento, ver renewal.ts).
export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ message: 'Prohibido' }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Datos inválidos' }, { status: 400 });
  const { userId, product, method, amountPen, operationCode } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { subscriptions: true } });
  if (!user) return NextResponse.json({ message: 'No existe ese cliente' }, { status: 404 });

  const bundle = product.startsWith('bundle:') ? getBundle(product.slice('bundle:'.length)) : undefined;
  let purchase: { product: string; plan: string; items: { product: PaymentItem['product']; plan: string }[] };
  if (bundle) {
    purchase = { product: 'bundle', plan: bundle.id, items: bundle.items };
  } else if (isProduct(product)) {
    const current = user.subscriptions.find((s) => s.product === product);
    if (!current) return NextResponse.json({ message: 'El cliente no tiene un plan en esa API: asígnaselo primero' }, { status: 400 });
    purchase = { product, plan: current.plan, items: [{ product, plan: current.plan }] };
  } else {
    return NextResponse.json({ message: 'API o pack inválido' }, { status: 400 });
  }

  // La cuota que ya tiene si sigue en el mismo plan (pudo asignarse a mano); si no, la del catálogo.
  const items: PaymentItem[] = purchase.items.map((i) => {
    const current = user.subscriptions.find((s) => s.product === i.product);
    return { ...i, monthlyLimit: current?.plan === i.plan ? current.monthlyLimit : (getPlan(i.product, i.plan)?.monthlyLimit ?? null) };
  });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        userId,
        product: purchase.product,
        plan: purchase.plan,
        amountPen,
        monthlyLimit: bundle ? null : items[0].monthlyLimit,
        items: items as unknown as object[],
        method,
        operationCode: operationCode || null,
        proofMime: '',
        proofData: new Uint8Array(0),
        status: 'approved',
        reviewedBy: admin.email,
        reviewedAt: now,
      },
    });
    await grantPlans(tx, userId, items, now);
  });

  return NextResponse.json({ ok: true });
}
