import Link from 'next/link';
import { Boxes, Package } from 'lucide-react';
import { BRAND_IDS, BRANDS, type Site } from '@/lib/brands';
import { ButtonLink } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/current-user';
import { isSiteFromHost } from '@/lib/brand-server';
import { panelHref } from '@/lib/urls';
import { allGuides, guidesFor } from '@/lib/guides';
import { BrandSwitcher } from './brand-switcher';
import { SiteLink } from '@/components/site/site-link';

const navLink =
  'rounded-lg px-3 py-2 font-medium text-[var(--on-header)] transition-colors hover:bg-black/6';

/** Secciones de contenido de cada API (el logo ya lleva al inicio). */
const SECTIONS: Record<Exclude<Site['id'], 'hub'>, { href: string; label: string }[]> = {
  shalom: [{ href: '/agencias', label: 'Agencias' }],
  olva: [{ href: '/agencias', label: 'Agencias' }],
  sunat: [
    { href: '/tipo-de-cambio', label: 'Tipo de cambio' },
    { href: '/catalogos', label: 'Catálogos' },
  ],
};

export async function Header({ site }: { site: Site }) {
  const [user, fromHost] = await Promise.all([getCurrentUser(), isSiteFromHost()]);
  const hub = site.id === 'hub';
  const hasGuides = (hub ? allGuides() : guidesFor(site.id)).length > 0;

  return (
    <>
      <div className="bg-[var(--darker)] text-[13px] text-[var(--on-dark-muted)]">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-x-6 gap-y-1 px-4 py-2">
          <span>
            {hub
              ? "APIs independientes de Mathyu's Solutions · no afiliadas a Shalom, Olva ni a la SUNAT"
              : `${site.id === 'sunat' ? 'API no oficial' : 'Servicio independiente'} de Mathyu's Solutions · no afiliado a ${site.owner}`}
          </span>
          <span className="hidden md:inline">
            {hub ? 'Una cuenta para todas las APIs · Yape o Plin' : (
              <>
                Una cuenta para todas las APIs ·{' '}
                <SiteLink site="hub" className="underline-offset-2 hover:underline">Mathyu&apos;s APIs</SiteLink>
              </>
            )}
          </span>
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-black/10 bg-[var(--header)] text-[var(--on-header)]">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]">
              {hub ? <Boxes size={20} /> : <Package size={20} />}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-lg font-extrabold tracking-tight">{site.name}</span>
              <span className="hidden text-xs opacity-70 sm:block">{hub ? 'Shalom · Olva · SUNAT' : "by Mathyu's Solutions"}</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 text-[15px] md:flex">
            {hub ? (
              <>
                {BRAND_IDS.map((id) => (
                  <SiteLink key={id} site={id} className={navLink}>{BRANDS[id].product}</SiteLink>
                ))}
                <Link href="/pricing" className={navLink}>Precios</Link>
                {hasGuides && <Link href="/guias" className={navLink}>Guías</Link>}
              </>
            ) : (
              <>
                {SECTIONS[site.id].map((s) => (
                  <Link key={s.href} href={s.href} className={navLink}>{s.label}</Link>
                ))}
                <Link href="/docs" className={navLink}>Documentación</Link>
                <Link href="/pricing" className={navLink}>Precios</Link>
                {hasGuides && <Link href="/guias" className={navLink}>Guías</Link>}
              </>
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {!fromHost && <BrandSwitcher current={site.id} />}
            {user ? (
              <ButtonLink href={panelHref('/dashboard')} size="sm">Mi panel</ButtonLink>
            ) : (
              <>
                <Link href={panelHref('/login')} className={`${navLink} hidden text-sm sm:inline-flex`}>Ingresar</Link>
                <ButtonLink href={panelHref('/register')} size="sm" className="whitespace-nowrap">Crear cuenta</ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
