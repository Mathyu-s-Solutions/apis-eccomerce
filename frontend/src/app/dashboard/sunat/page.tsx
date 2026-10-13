import type { Metadata } from 'next';
import { SunatPanel } from '@/components/dashboard/sunat-panel';
import { SiteLink } from '@/components/site/site-link';

export const metadata: Metadata = { title: 'Facturación SUNAT' };

export default function SunatPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Facturación SUNAT</h1>
      <p className="mt-1 text-[var(--muted)]">
        Tus empresas emisoras, sus credenciales y los comprobantes que emites por la API.{' '}
        <SiteLink site="sunat" path="/docs" className="font-medium text-[var(--accent)] hover:underline">
          Ver la documentación
        </SiteLink>
      </p>
      <div className="mt-6">
        <SunatPanel />
      </div>
    </div>
  );
}
