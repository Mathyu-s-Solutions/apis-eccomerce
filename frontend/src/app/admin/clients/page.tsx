import type { Metadata } from 'next';
import { listClients } from '@/lib/admin';
import { PageHeader } from '@/components/admin/parts';
import { ClientsTable } from '@/components/admin/clients-table';
import { NewClientButton } from '@/components/admin/new-client';

export const metadata: Metadata = { title: 'Clientes' };

export default async function AdminClientsPage() {
  const clients = await listClients();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Todos los registrados, con su plan y lo que consumen este mes. Entra a uno para cambiarle el plan, subirle la cuota, ver sus keys o sus pagos."
        actions={<NewClientButton />}
      />
      <ClientsTable clients={clients} />
    </div>
  );
}
