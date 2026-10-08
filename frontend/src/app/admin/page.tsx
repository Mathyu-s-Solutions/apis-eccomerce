import { PaymentsReview } from '@/components/admin/payments-review';

export default function AdminPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Validación de pagos</h1>
      <p className="mt-1 text-[var(--muted)]">Revisa los comprobantes de Yape/Plin. Al aprobar, se amplía la cuota del cliente.</p>
      <div className="mt-6">
        <PaymentsReview />
      </div>
    </div>
  );
}
