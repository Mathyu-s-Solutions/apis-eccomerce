import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { getPlan } from '@/lib/plans';
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
  return NextResponse.json({ payments });
}

// Registro de un pago (Yape/Plin) con su comprobante. Queda pendiente de validar.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'No autenticado' }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ message: 'Formulario inválido' }, { status: 400 });

  const product = String(form.get('product') ?? '');
  const planId = String(form.get('plan') ?? '');
  const method = String(form.get('method') ?? '');
  const operationCode = String(form.get('operationCode') ?? '').trim() || null;
  const proof = form.get('proof');

  if (!['shalom', 'olva', 'sunat'].includes(product)) {
    return NextResponse.json({ message: 'Producto inválido' }, { status: 400 });
  }
  if (!['yape', 'plin'].includes(method)) {
    return NextResponse.json({ message: 'Método de pago inválido' }, { status: 400 });
  }
  const plan = getPlan(product, planId);
  if (!plan || plan.pricedPen <= 0) {
    return NextResponse.json({ message: 'Plan inválido' }, { status: 400 });
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
      product,
      plan: plan.id,
      amountPen: plan.pricedPen,
      monthlyLimit: plan.monthlyLimit,
      method,
      operationCode,
      proofMime: proof.type,
      proofData: bytes,
      status: 'pending',
    },
  });

  await notifyOwner(
    `Nuevo pago por validar — ${product} ${plan.name}`,
    `<p>${user.email} registró un pago.</p>
     <ul>
       <li>Producto: <b>${product}</b></li>
       <li>Plan: <b>${plan.name}</b> (S/ ${plan.pricedPen})</li>
       <li>Método: <b>${method}</b>${operationCode ? ` — Op. ${operationCode}` : ''}</li>
     </ul>
     <p>Valídalo en el panel de administración.</p>`,
  );

  return NextResponse.json({ ok: true, id: payment.id });
}
