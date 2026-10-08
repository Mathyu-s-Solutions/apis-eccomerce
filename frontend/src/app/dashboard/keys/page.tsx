import { isProduct } from '@/lib/plans';
import { KeysManager } from '@/components/dashboard/keys-manager';

export default async function KeysPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product } = await searchParams;
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">API keys</h1>
      <p className="mt-1 text-[var(--muted)]">
        Crea una key por API o una para todas. La cuota es la de tu plan en cada API: la comparten todas tus keys.
      </p>
      <div className="mt-6">
        <KeysManager defaultProduct={isProduct(product) ? product : 'all'} />
      </div>
    </div>
  );
}
