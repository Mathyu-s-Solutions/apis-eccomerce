import Link from 'next/link';
import { Package } from 'lucide-react';
import type { Brand } from '@/lib/brands';
import { ButtonLink } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/current-user';
import { isBrandFromHost } from '@/lib/brand-server';
import { BrandSwitcher } from './brand-switcher';

const navLink =
  'rounded-lg px-3 py-2 font-medium text-[var(--on-header)] transition-colors hover:bg-black/6';

export async function Header({ brand }: { brand: Brand }) {
  const [user, fromHost] = await Promise.all([getCurrentUser(), isBrandFromHost()]);
  const anchor = brand.id === 'sunat' ? { href: '/#ruc', label: 'Consulta RUC' } : { href: '/#agencias', label: 'Agencias' };

  return (
    <>
      <div className="bg-[var(--darker)] text-[13px] text-[var(--on-dark-muted)]">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-x-6 gap-y-1 px-4 py-2">
          <span>
            {brand.id === 'sunat' ? 'API no oficial' : 'Servicio independiente'} de Mathyu&apos;s Solutions · no afiliado a {brand.owner}
          </span>
          <span className="hidden md:inline">Soporte en español · Pagos con Yape o Plin</span>
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-black/10 bg-[var(--header)] text-[var(--on-header)]">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="brand-mark flex h-9 w-9 items-center justify-center rounded-[10px]">
              <Package size={20} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-lg font-extrabold tracking-tight">{brand.name}</span>
              <span className="hidden text-xs opacity-70 sm:block">by Mathyu&apos;s Solutions</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 text-[15px] md:flex">
            <Link href="/" className={navLink}>Inicio</Link>
            <Link href={anchor.href} className={navLink}>{anchor.label}</Link>
            <Link href="/docs" className={navLink}>Documentación</Link>
            <Link href="/pricing" className={navLink}>Precios</Link>
          </nav>

          <div className="flex items-center gap-2">
            {!fromHost && <BrandSwitcher current={brand.id} />}
            {user ? (
              <ButtonLink href="/dashboard" size="sm">Mi panel</ButtonLink>
            ) : (
              <>
                <Link href="/login" className={`${navLink} hidden text-sm sm:inline-flex`}>Ingresar</Link>
                <ButtonLink href="/register" size="sm" className="whitespace-nowrap">Crear API key</ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
