import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { forbidden, getAdmin } from '@/lib/admin';
import { currentPeriod } from '@/lib/period';
import { freePlan, getPlan, PRODUCTS, purchaseOf } from '@/lib/plans';
import { addMonthsKeepingDay, endOfLimaDay, extendedExpiry } from '@/lib/renewal';

const product = z.enum(PRODUCTS);

const schema = z.discriminatedUnion('action', [
  // Plan o pack sin pago de por medio (cortesía, cliente propio). months 0 y sin `until` = no vence.
  z.object({
    action: z.literal('assign'),
    purchase: z.string().trim().min(1),
    months: z.number().int().min(0).max(24),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  // Días de regalo sobre el vencimiento.
  z.object({ action: z.literal('extend'), products: z.array(product).min(1), days: z.number().int().min(1).max(366) }),
  // Cuota mensual a medida (null = ilimitada). Sin plan de pago vigente, es la cuota de prueba.
  z.object({ action: z.literal('quota'), product, monthlyLimit: z.number().int().min(0).max(100_000_000).nullable() }),
  // Vuelve al plan de prueba estándar.
  z.object({ action: z.literal('remove'), product }),
  // El consumo del mes vuelve a 0.
  z.object({ action: z.literal('reset-usage'), product }),
]);

/** Cambios a mano en los planes de un cliente, sin pago de por medio. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return forbidden();

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Datos inválidos' }, { status: 400 });
  const body = parsed.data;

  const { id: userId } = await params;
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { subscriptions: true } });
  if (!user) return NextResponse.json({ message: 'No existe ese cliente' }, { status: 404 });
  const now = new Date();
  const subOf = (p: string) => user.subscriptions.find((s) => s.product === p);
  const where = (p: string) => ({ userId_product: { userId, product: p } });

  switch (body.action) {
    case 'assign': {
      const purchase = purchaseOf(body.purchase);
      if (!purchase) return NextResponse.json({ message: 'Plan o pack inválido' }, { status: 400 });
      let expiresAt: Date | null = null;
      if (body.until) {
        expiresAt = endOfLimaDay(body.until);
        if (expiresAt <= now) return NextResponse.json({ message: 'Esa fecha ya pasó' }, { status: 400 });
      } else if (body.months > 0) {
        expiresAt = addMonthsKeepingDay(now, body.months);
      }
      await prisma.$transaction(
        purchase.items.map((item) => {
          const plan = getPlan(item.product, item.plan)!;
          return prisma.subscription.upsert({
            where: where(item.product),
            create: { userId, product: item.product, plan: plan.id, monthlyLimit: plan.monthlyLimit, expiresAt },
            update: { plan: plan.id, monthlyLimit: plan.monthlyLimit, expiresAt },
          });
        }),
      );
      return NextResponse.json({ ok: true, message: `${purchase.name} asignado.` });
    }

    case 'extend': {
      const subs = body.products.map(subOf).filter((s) => s?.expiresAt && s.plan !== 'free');
      if (subs.length === 0) return NextResponse.json({ message: 'No tiene un plan con vencimiento para extender' }, { status: 400 });
      await prisma.$transaction(
        subs.map((s) => prisma.subscription.update({ where: { id: s!.id }, data: { expiresAt: extendedExpiry(s!.expiresAt, body.days, now) } })),
      );
      return NextResponse.json({ ok: true, message: `Plan extendido ${body.days} ${body.days === 1 ? 'día' : 'días'}.` });
    }

    case 'quota': {
      const sub = subOf(body.product);
      const active = sub && (!sub.expiresAt || sub.expiresAt > now);
      if (sub && active && sub.plan !== 'free') {
        await prisma.subscription.update({ where: { id: sub.id }, data: { monthlyLimit: body.monthlyLimit } });
        return NextResponse.json({ ok: true, message: 'Cuota del plan actualizada.' });
      }
      // Pisaría su plan vencido: perdería el aviso de vencido y el día con el que renueva.
      if (sub && !active && sub.plan !== 'free') {
        return NextResponse.json({ message: 'Tiene un plan vencido: renuévalo o quítalo antes de cambiar su cuota de prueba' }, { status: 409 });
      }
      // En prueba: la cuota estándar no necesita fila; otra, va como un plan "free" sin vencimiento.
      if (body.monthlyLimit === freePlan(body.product).monthlyLimit) {
        await prisma.subscription.deleteMany({ where: { userId, product: body.product } });
      } else {
        await prisma.subscription.upsert({
          where: where(body.product),
          create: { userId, product: body.product, plan: 'free', monthlyLimit: body.monthlyLimit, expiresAt: null },
          update: { plan: 'free', monthlyLimit: body.monthlyLimit, expiresAt: null },
        });
      }
      return NextResponse.json({ ok: true, message: 'Cuota de prueba actualizada.' });
    }

    case 'remove': {
      await prisma.subscription.deleteMany({ where: { userId, product: body.product } });
      return NextResponse.json({ ok: true, message: 'Plan quitado: rige el de prueba.' });
    }

    case 'reset-usage': {
      await prisma.planUsage.deleteMany({ where: { userId, product: body.product, period: currentPeriod(now) } });
      return NextResponse.json({ ok: true, message: 'Consumo del mes reiniciado.' });
    }
  }
}
