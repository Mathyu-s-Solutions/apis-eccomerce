import { getBrand } from '@/lib/brand-server';
import { KeysManager } from '@/components/dashboard/keys-manager';

export default async function KeysPage() {
  const brand = await getBrand();
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">API keys</h1>
      <p className="mt-1 text-[var(--muted)]">Crea y administra las keys con las que llamas a la API.</p>
      <div className="mt-6">
        <KeysManager defaultProduct={brand.id} />
      </div>
    </div>
  );
}
