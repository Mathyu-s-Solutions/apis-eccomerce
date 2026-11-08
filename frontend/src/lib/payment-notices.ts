import 'server-only';
import { prisma } from './db';
import { contactEmail } from './legal';
import { sendEmail } from './email';
import { paymentReviewedEmail } from './email-templates';
import { PRODUCTS } from './plans';
import { paymentItems } from './subscriptions';

/**
 * Correo al cliente cuando el admin aprueba o rechaza su pago (o registra uno
 * hecho por fuera). Se llama con `after()`: el admin no espera a Resend.
 */
export async function notifyPaymentReviewed(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    omit: { proofData: true },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!payment || payment.status === 'pending') return;

  const products = paymentItems(payment).map((i) => i.product);
  const plans =
    payment.status === 'approved'
      ? await prisma.subscription.findMany({
          where: { userId: payment.userId, product: { in: products } },
          select: { product: true, plan: true, expiresAt: true },
        })
      : [];
  const order = (product: string) => (PRODUCTS as readonly string[]).indexOf(product);
  plans.sort((a, b) => order(a.product) - order(b.product));

  const email = paymentReviewedEmail({ name: payment.user.name, payment, plans });
  await sendEmail({ to: payment.user.email, replyTo: contactEmail(), ...email });
}
