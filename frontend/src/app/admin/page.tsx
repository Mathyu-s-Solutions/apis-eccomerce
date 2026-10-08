import { PaymentsReview } from '@/components/admin/payments-review';
import { PlansManager } from '@/components/admin/plans-manager';

export default function AdminPage() {
  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Validación de pagos</h1>
        <p className="mt-1 text-[var(--muted)]">
          Revisa los comprobantes de Yape/Plin. Al aprobar, se activan por un mes los planes que compró el cliente (uno, o los de un pack).
        </p>
        <div className="mt-6">
          <PaymentsReview />
        </div>
      </section>
      <section>
        <h2 className="text-2xl font-bold tracking-tight">Planes de clientes</h2>
        <p className="mt-1 text-[var(--muted)]">Asigna o quita un plan a mano (sin pago de por medio), por ejemplo a un cliente propio.</p>
        <div className="mt-6">
          <PlansManager />
        </div>
      </section>
    </div>
  );
}
