import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

// Sirve la imagen del comprobante. Solo el dueño del pago o un admin.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response('No autenticado', { status: 401 });

  const { id } = await params;
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) return new Response('No encontrado', { status: 404 });
  if (payment.userId !== user.id && !user.isAdmin) {
    return new Response('Prohibido', { status: 403 });
  }

  return new Response(new Uint8Array(payment.proofData), {
    headers: {
      'content-type': payment.proofMime,
      'cache-control': 'private, no-store',
    },
  });
}
