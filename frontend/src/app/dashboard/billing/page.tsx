import { getCurrentUser } from '@/lib/current-user';
import { getBrand } from '@/lib/brand-server';
import { PLANS } from '@/lib/plans';
import { PaymentForm } from '@/components/dashboard/payment-form';
import { PaymentHistory } from '@/components/dashboard/payment-history';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const user = (await getCurrentUser())!;
  const brand = await getBrand();
  const { plan } = await searchParams;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pagos y planes</h1>
        <p className="mt-1 text-[var(--muted)]">Sube de plan pagando con Yape o Plin. Validamos tu comprobante y ampliamos tu cuota.</p>
      </div>

      <PaymentForm
        product={brand.id}
        plans={PLANS[brand.id]}
        initialPlan={plan}
        yape={process.env.NEXT_PUBLIC_YAPE_NUMBER ?? '—'}
        plin={process.env.NEXT_PUBLIC_PLIN_NUMBER ?? '—'}
        payName={process.env.NEXT_PUBLIC_PAY_NAME ?? "Mathyu's Solutions"}
      />

      <div>
        <h2 className="mb-3 font-semibold">Historial de pagos</h2>
        <PaymentHistory userId={user.id} />
      </div>
    </div>
  );
}
