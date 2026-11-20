import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { forbidden, getAdmin, isUniqueViolation, registerPayment } from '@/lib/admin';
import { notifyPaymentReviewed } from '@/lib/payment-notices';
import { PAYMENT_METHODS } from '@/lib/plans';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const schema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    name: z.string().trim().max(80).optional(),
    // `plan:<api>:<plan>` o `bundle:<pack>`.
    purchase: z.string().trim().min(1),
    months: z.coerce.number().int().min(1).max(12),
    amountPen: z.coerce.number().int().min(0).max(100_000),
    method: z.string().refine((m) => Object.hasOwn(PAYMENT_METHODS, m)),
    operationCode: z.string().trim().max(40).optional(),
    note: z.string().trim().max(300).optional(),
    // "1": le llega el correo de pago confirmado.
    notify: z.enum(['0', '1']).default('1'),
    // "1": si es un cambio a un plan mayor, cobra la diferencia y mantiene su vencimiento.
    prorate: z.enum(['0', '1']).default('0'),
  })
  .refine((d) => d.userId || d.email, { message: 'Falta el cliente' });

// Pago hecho por fuera (Yape/Plin por WhatsApp, transferencia, efectivo): queda
// aprobado y activa o renueva el plan o pack esos meses. Multipart: el comprobante es opcional.
export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return forbidden();

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ message: 'Formulario inválido' }, { status: 400 });
  const fields = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string' && v !== ''));
  const parsed = schema.safeParse(fields);
  if (!parsed.success) {
    const noClient = parsed.error.issues.some((i) => i.path.length === 0);
    return NextResponse.json({ message: noClient ? 'Elige un cliente o escribe su correo' : 'Datos inválidos' }, { status: 400 });
  }

  const file = form.get('proof');
  let proof: { mime: string; data: Uint8Array<ArrayBuffer> } | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return NextResponse.json({ message: 'El comprobante supera los 5 MB' }, { status: 400 });
    if (!ALLOWED.includes(file.type)) return NextResponse.json({ message: 'Formato no permitido (JPG, PNG, WEBP o PDF)' }, { status: 400 });
    proof = { mime: file.type, data: new Uint8Array(await file.arrayBuffer()) };
  }

  const { notify, prorate, ...input } = parsed.data;
  let result: Awaited<ReturnType<typeof registerPayment>>;
  try {
    result = await registerPayment(admin, { ...input, proof, prorate: prorate === '1' });
  } catch (err) {
    if (isUniqueViolation(err)) return NextResponse.json({ message: 'Ese correo acaba de crear su cuenta: búscalo en la lista y vuelve a intentarlo' }, { status: 409 });
    throw err;
  }
  if ('error' in result) return NextResponse.json({ message: result.error }, { status: 400 });

  // Al cliente: confirmamos el pago y hasta cuándo quedan sus planes.
  if (notify === '1') after(() => notifyPaymentReviewed(result.paymentId));

  return NextResponse.json({ ok: true, userId: result.userId, created: result.created });
}
