import { after, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { getBundle, getPlan, PRODUCT_NAME, purchaseOf, type PaymentItem } from '@/lib/plans';
import { paymentLabel } from '@/lib/subscriptions';
import { upgradeQuote } from '@/lib/upgrade';
import { formatDate } from '@/lib/utils';
import { notifyOwner } from '@/lib/email';
import { paymentReceivedEmail } from '@/lib/email-templates';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'No autenticado' }, { status: 401 });

  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, product: true, plan: true, amountPen: true, method: true,
      operationCode: true, status: true, note: true, createdAt: true, reviewedAt: true, items: true,
    },
  });
  return NextResponse.json({ payments: payments.map(({ items, ...p }) => ({ ...p, label: paymentLabel({ ...p, items }) })) });
}

// Registro de un pago (Yape/Plin) con su comprobante: el plan de una API
// (product + plan) o un pack (bundle). Queda pendiente de validar.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'No autenticado' }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ message: 'Formulario inválido' }, { status: 400 });

  const bundleId = String(form.get('bundle') ?? '');
  const product = String(form.get('product') ?? '');
  const planId = String(form.get('plan') ?? '');
  // Yape y Plin pagan al mismo número (y al mismo QR): un solo método.
  const method = 'yape_plin';
  const operationCode = String(form.get('operationCode') ?? '').trim() || null;
  const proof = form.get('proof');

  // Qué se compra: los planes que activa, el monto y cómo se guarda.
  let purchase: { product: string; plan: string; name: string; amountPen: number; monthlyLimit: number | null; items: PaymentItem[] };
  if (bundleId) {
    const bundle = getBundle(bundleId);
    if (!bundle) return NextResponse.json({ message: 'Pack inválido' }, { status: 400 });
    const items = bundle.items.map((i) => ({ ...i, monthlyLimit: getPlan(i.product, i.plan)?.monthlyLimit ?? null }));
    purchase = { product: 'bundle', plan: bundle.id, name: `${bundle.name} (${bundle.description})`, amountPen: bundle.pricedPen, monthlyLimit: null, items };
  } else {
    const plan = getPlan(product, planId);
    if (!plan || plan.pricedPen <= 0) {
      return NextResponse.json({ message: 'Plan inválido' }, { status: 400 });
    }
    const items: PaymentItem[] = [{ product: product as PaymentItem['product'], plan: plan.id, monthlyLimit: plan.monthlyLimit }];
    purchase = { product, plan: plan.id, name: `${PRODUCT_NAME[items[0].product]} ${plan.name}`, amountPen: plan.pricedPen, monthlyLimit: plan.monthlyLimit, items };
  }
  // Si ya tiene un plan y pasa a uno mayor, paga la diferencia por los días que le
  // quedan y mantiene su vencimiento (lib/upgrade.ts). El monto lo pone el servidor.
  const chosen = purchaseOf(bundleId ? `bundle:${bundleId}` : `plan:${product}:${planId}`);
  const subs = await prisma.subscription.findMany({ where: { userId: user.id }, select: { product: true, plan: true, expiresAt: true } });
  const quote = chosen ? upgradeQuote(subs, chosen) : null;
  if (quote) {
    const expiresAt = quote.expiresAt.toISOString();
    purchase = {
      ...purchase,
      name: `Cambio a ${purchase.name}: diferencia por ${quote.days} ${quote.days === 1 ? 'día' : 'días'}, vence el ${formatDate(quote.expiresAt)}`,
      amountPen: quote.amountPen,
      items: purchase.items.map((i) => ({ ...i, expiresAt })),
    };
  }

  if (!(proof instanceof File) || proof.size === 0) {
    return NextResponse.json({ message: 'Sube la foto del comprobante' }, { status: 400 });
  }
  if (proof.size > MAX_BYTES) {
    return NextResponse.json({ message: 'El archivo supera los 5 MB' }, { status: 400 });
  }
  if (!ALLOWED.includes(proof.type)) {
    return NextResponse.json({ message: 'Formato no permitido (usa JPG, PNG, WEBP o PDF)' }, { status: 400 });
  }

  const bytes = Buffer.from(await proof.arrayBuffer());
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      product: purchase.product,
      plan: purchase.plan,
      amountPen: purchase.amountPen,
      monthlyLimit: purchase.monthlyLimit,
      items: purchase.items as unknown as object[],
      method,
      operationCode,
      proofMime: proof.type,
      proofData: bytes,
      status: 'pending',
    },
  });

  // El aviso al dueño (con el comprobante adjunto) sale después de responder: el cliente no espera a Resend.
  after(async () => {
    const { subject, html } = paymentReceivedEmail({ user, purchase, method, operationCode });
    await notifyOwner(subject, html, [{ filename: `comprobante.${PROOF_EXT[proof.type] ?? 'bin'}`, content: bytes }]);
  });

  return NextResponse.json({ ok: true, id: payment.id });
}

const PROOF_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
