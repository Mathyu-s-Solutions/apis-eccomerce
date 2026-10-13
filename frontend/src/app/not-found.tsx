import type { Metadata } from 'next';
import Link from 'next/link';
import { Boxes, Package } from 'lucide-react';
import { getSite } from '@/lib/brand-server';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Página no encontrada' };

export default async function NotFound() {
  const site = await getSite();
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
        <span className="brand-mark flex h-9 w-9 items-center justify-center rounded-[10px]">
          {site.id === 'hub' ? <Boxes size={20} /> : <Package size={20} />}
        </span>
        {site.name}
      </Link>
      <p className="mt-10 text-sm font-semibold text-[var(--accent)]">Error 404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">No encontramos esta página</h1>
      <p className="mt-3 max-w-md text-[var(--muted)]">El link puede estar mal escrito o la página ya no existe.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/">Ir al inicio</ButtonLink>
        <ButtonLink href="/pricing" variant="outline">Ver precios</ButtonLink>
      </div>
    </main>
  );
}
