import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { getBundle, getPlan, PRODUCT_NAME, type PaymentItem } from '@/lib/plans';
import { paymentLabel } from '@/lib/subscriptions';
import { notifyOwner } from '@/lib/email';

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
      operationCode: true, status: true, note: true, createdAt: true, reviewedAt: true,
    },
  });
  return NextResponse.json({ payments: payments.map((p) => ({ ...p, label: paymentLabel(p) })) });
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
  const method = String(form.get('method') ?? '');
  const operationCode = String(form.get('operationCode') ?? '').trim() || null;
  const proof = form.get('proof');

  if (!['yape', 'plin'].includes(method)) {
    return NextResponse.json({ message: 'Método de pago inválido' }, { status: 400 });
  }

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

  await notifyOwner(
    `Nuevo pago por validar — ${purchase.name}`,
    `<p>${user.email} registró un pago.</p>
     <ul>
       <li>Compra: <b>${purchase.name}</b> (S/ ${purchase.amountPen})</li>
       <li>Método: <b>${method}</b>${operationCode ? ` — Op. ${operationCode}` : ''}</li>
     </ul>
     <p>Valídalo en el panel de administración.</p>`,
  );

  return NextResponse.json({ ok: true, id: payment.id });
}
