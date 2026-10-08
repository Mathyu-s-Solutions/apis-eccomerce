import Link from 'next/link';
import { Boxes } from 'lucide-react';
import type { Brand } from '@/lib/brands';
import { ButtonLink } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/current-user';
import { isBrandFromHost } from '@/lib/brand-server';
import { BrandSwitcher } from './brand-switcher';

export async function Header({ brand }: { brand: Brand }) {
  const [user, fromHost] = await Promise.all([getCurrentUser(), isBrandFromHost()]);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white brand-gradient">
            <Boxes size={18} />
          </span>
          <span>{brand.name}</span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm text-[var(--muted)] md:flex">
          <Link href="/" className="rounded-lg px-3 py-2 hover:bg-[var(--surface)] hover:text-[var(--foreground)]">Inicio</Link>
          <Link href="/docs" className="rounded-lg px-3 py-2 hover:bg-[var(--surface)] hover:text-[var(--foreground)]">Documentación</Link>
          <Link href="/pricing" className="rounded-lg px-3 py-2 hover:bg-[var(--surface)] hover:text-[var(--foreground)]">Precios</Link>
        </nav>

        <div className="flex items-center gap-2">
          {!fromHost && <BrandSwitcher current={brand.id} />}
          {user ? (
            <ButtonLink href="/dashboard" size="sm">Mi panel</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">Ingresar</ButtonLink>
              <ButtonLink href="/register" size="sm">Crear cuenta</ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
