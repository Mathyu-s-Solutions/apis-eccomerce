import Link from 'next/link';
import { BRAND_IDS, BRANDS, type Site } from '@/lib/brands';
import { contactEmail } from '@/lib/legal';
import { panelHref } from '@/lib/urls';
import { directoryPath, getDirectory } from '@/lib/directory';
import { allGuides, guidesFor } from '@/lib/guides';
import { SiteLink } from '@/components/site/site-link';

const link = 'text-[var(--on-dark-muted)] transition-colors hover:text-white';

/** Enlaces al contenido de cada sitio (directorio, tipo de cambio, catálogos, guías). */
function resources(site: Site): { site: Site['id']; path: string; label: string }[] {
  if (site.id === 'hub') {
    return [
      { site: 'shalom', path: '/agencias', label: 'Agencias Shalom' },
      { site: 'olva', path: '/agencias', label: 'Agencias Olva Courier' },
      { site: 'sunat', path: '/tipo-de-cambio', label: 'Tipo de cambio SBS' },
      { site: 'sunat', path: '/catalogos', label: 'Catálogos de SUNAT' },
    ];
  }
  if (site.id === 'sunat') {
    return [
      { site: 'sunat', path: '/tipo-de-cambio', label: 'Tipo de cambio de hoy' },
      { site: 'sunat', path: '/catalogos', label: 'Catálogos de SUNAT' },
      { site: 'sunat', path: '/catalogos/07-tipo-de-afectacion-del-igv', label: 'Afectación del IGV' },
      { site: 'sunat', path: '/catalogos/54-bienes-y-servicios-sujetos-a-detraccion', label: 'Detracciones' },
    ];
  }
  // Los departamentos con más agencias.
  const top = [...getDirectory(site.id).departments].sort((a, b) => b.agencies.length - a.agencies.length).slice(0, 3);
  return [
    { site: site.id, path: directoryPath.index(), label: 'Todas las agencias' },
    ...top.map((d) => ({ site: site.id, path: directoryPath.department(d), label: `Agencias en ${d.name}` })),
  ];
}

export function Footer({ site }: { site: Site }) {
  const email = contactEmail();
  const hasGuides = (site.id === 'hub' ? allGuides() : guidesFor(site.id)).length > 0;
  return (
    <footer className="bg-[var(--darker)] text-[var(--on-dark-muted)]">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-14">
        <div className="flex flex-col justify-between gap-8 md:flex-row">
          <div className="max-w-sm">
            <p className="text-xl font-extrabold text-white">{site.name}</p>
            <p className="mt-2 text-[15px] leading-relaxed">{site.tagline}. Un producto de Mathyu&apos;s Solutions.</p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-[15px] sm:auto-cols-max sm:grid-flow-col sm:grid-cols-none">
            <div>
              <p className="mb-3 font-semibold text-white">APIs</p>
              <ul className="space-y-2">
                {BRAND_IDS.map((id) => (
                  <li key={id}><SiteLink site={id} className={link}>{BRANDS[id].name}</SiteLink></li>
                ))}
                <li><SiteLink site="hub" path="/pricing" className={link}>Precios y packs</SiteLink></li>
              </ul>
            </div>
            {site.id !== 'hub' && (
              <div>
                <p className="mb-3 font-semibold text-white">{site.product}</p>
                <ul className="space-y-2">
                  <li><Link href="/" className={link}>Inicio</Link></li>
                  <li><Link href="/docs" className={link}>Documentación</Link></li>
                  <li><Link href="/pricing" className={link}>Precios</Link></li>
                </ul>
              </div>
            )}
            <div>
              <p className="mb-3 font-semibold text-white">Recursos</p>
              <ul className="space-y-2">
                {resources(site).map((r) =>
                  r.site === site.id ? (
                    <li key={r.path}><Link href={r.path} className={link}>{r.label}</Link></li>
                  ) : (
                    <li key={`${r.site}${r.path}`}><SiteLink site={r.site} path={r.path} className={link}>{r.label}</SiteLink></li>
                  ),
                )}
                {hasGuides && <li><Link href="/guias" className={link}>Guías</Link></li>}
              </ul>
            </div>
            <div>
              <p className="mb-3 font-semibold text-white">Cuenta</p>
              <ul className="space-y-2">
                <li><Link href={panelHref('/login')} className={link}>Ingresar</Link></li>
                <li><Link href={panelHref('/register')} className={link}>Crear cuenta</Link></li>
                <li><Link href={panelHref('/dashboard')} className={link}>Mi panel</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 font-semibold text-white">Legal</p>
              <ul className="space-y-2">
                <li><Link href="/terminos" className={link}>Términos y condiciones</Link></li>
                <li><Link href="/privacidad" className={link}>Política de privacidad</Link></li>
                <li><a href={`mailto:${email}`} className={link}>Contacto</a></li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-10 border-t border-white/10 pt-6 text-[13px]">
          © {new Date().getFullYear()} Mathyu&apos;s Solutions.{' '}
          {site.id === 'hub'
            ? 'Servicios independientes: no estamos afiliados a Shalom, Olva Courier ni a la SUNAT.'
            : site.id === 'sunat'
              ? 'API no oficial: no somos la SUNAT ni representamos al Estado peruano.'
              : `Servicio independiente, no afiliado oficialmente con ${site.owner}.`}{' '}
          Las marcas pertenecen a sus titulares.
        </p>
      </div>
    </footer>
  );
}
