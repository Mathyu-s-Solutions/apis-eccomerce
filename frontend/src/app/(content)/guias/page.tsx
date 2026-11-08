import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getSite } from '@/lib/brand-server';
import { getSiteById, type Site } from '@/lib/brands';
import { allGuides, guidePath, guidesFor, type Guide } from '@/lib/guides';
import { pageMetadata } from '@/lib/seo';
import { formatDate } from '@/lib/utils';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { SiteLink } from '@/components/site/site-link';
import { PageIntro, pageContainer } from '@/components/directory/parts';

const TOPIC: Record<Site['id'], string> = {
  hub: 'envíos y facturación electrónica para tu ecommerce en Perú',
  shalom: 'integrar Shalom en tu tienda: rastreo, agencias, cotización y webhooks',
  olva: 'integrar Olva Courier en tu tienda: rastreo, agencias, ubigeos y cotización',
  sunat: 'facturación electrónica, guías de remisión y consultas a SUNAT desde tu sistema',
};

/** En la central se listan las guías de todos los sitios; en cada API, las suyas. */
function listFor(site: Site): Guide[] {
  return site.id === 'hub' ? allGuides() : guidesFor(site.id);
}

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  if (!listFor(site).length) return {};
  return pageMetadata(site, {
    title: site.id === 'hub' ? 'Guías para tu ecommerce' : `Guías de ${site.name}`,
    description: `Guías prácticas sobre ${TOPIC[site.id]}, con ejemplos de código listos para copiar.`,
    path: guidePath(),
  });
}

export default async function GuidesIndexPage() {
  const site = await getSite();
  const guides = listFor(site);
  if (!guides.length) notFound();

  return (
    <div className={`${pageContainer} flex flex-col gap-12 py-12`}>
      <PageIntro
        crumbs={<Breadcrumbs items={[{ name: site.name, path: '/' }, { name: 'Guías', path: guidePath() }]} />}
        title={site.id === 'hub' ? 'Guías para tu ecommerce' : `Guías de ${site.name}`}
      >
        <p>Guías prácticas sobre {TOPIC[site.id]}, con ejemplos que puedes copiar y probar con tu API key.</p>
      </PageIntro>

      <ul className="grid gap-5 md:grid-cols-2">
        {guides.map((g) => {
          const card = (
            <>
              <span className="text-sm text-[var(--muted)]">
                {site.id === 'hub' && g.site !== 'hub' && <span className="font-semibold text-[var(--accent)]">{getSiteById(g.site).name} · </span>}
                <time dateTime={g.date}>{formatDate(`${g.date}T12:00:00Z`)}</time> · {g.readingMinutes} min de lectura
              </span>
              <h2 className="text-xl font-bold leading-snug tracking-tight">{g.title}</h2>
              <p className="text-[15px] leading-relaxed text-[var(--muted)]">{g.description}</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold text-[var(--accent)]">
                Leer la guía <ArrowRight size={14} aria-hidden />
              </span>
            </>
          );
          const cls =
            'flex h-full flex-col gap-2.5 rounded-2xl border border-[var(--border)] bg-white p-6 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md';
          return (
            <li key={`${g.site}/${g.slug}`}>
              {g.site === site.id ? (
                <Link href={guidePath(g)} className={cls}>
                  {card}
                </Link>
              ) : (
                <SiteLink site={g.site} path={guidePath(g)} className={cls}>
                  {card}
                </SiteLink>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
