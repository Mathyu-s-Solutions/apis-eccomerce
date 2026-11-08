import type { MetadataRoute } from 'next';
import { getSite } from '@/lib/brand-server';
import { directoryUrls, getDirectory } from '@/lib/directory';
import { allPeriods, limaToday, periodSlug } from '@/lib/exchange-rate';
import { allGuides, guidePath, guidesFor } from '@/lib/guides';
import { CATALOGS, catalogPath } from '@/lib/sunat-catalogs';
import { requestOrigin } from '@/lib/seo';

type Entry = { path: string; priority: number; changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>; lastModified?: string };

/** Fecha de corte de los catálogos (se cambia al regenerar src/data/sunat-catalogs.json). */
const CATALOGS_UPDATED = '2026-11-08';

/**
 * Páginas públicas del sitio del dominio (la central o la de una API). Las páginas que
 * generan los datos (agencias, tipo de cambio, catálogos, guías) entran solas: cuando
 * cambia el snapshot o se publica una guía, el sitemap ya las incluye.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [site, origin] = await Promise.all([getSite(), requestOrigin()]);
  const pages: Entry[] = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/docs', priority: site.id === 'hub' ? 0.6 : 0.8, changeFrequency: 'monthly' },
    // El registro vive en el panel (con dominios propios, solo en el dominio central).
    ...(site.id === 'hub' ? [{ path: '/register', priority: 0.5, changeFrequency: 'yearly' as const }] : []),
    { path: '/terminos', priority: 0.2, changeFrequency: 'yearly' },
    { path: '/privacidad', priority: 0.2, changeFrequency: 'yearly' },
  ];

  if (site.id === 'shalom' || site.id === 'olva') {
    const { updatedAt } = getDirectory(site.id);
    for (const path of directoryUrls(site.id)) {
      const depth = path.split('/').length;
      pages.push({
        path,
        priority: path === '/agencias' ? 0.9 : path.startsWith('/agencia/') ? 0.6 : depth === 3 ? 0.8 : 0.7,
        changeFrequency: 'weekly',
        lastModified: updatedAt,
      });
    }
  }

  if (site.id === 'sunat') {
    const today = limaToday();
    pages.push({ path: '/tipo-de-cambio', priority: 0.9, changeFrequency: 'daily', lastModified: today });
    allPeriods().forEach(({ year, month }, i) => {
      const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      pages.push({
        path: `/tipo-de-cambio/${periodSlug(year, month)}`,
        priority: i < 3 ? 0.7 : 0.4,
        changeFrequency: i === 0 ? 'daily' : 'yearly',
        lastModified: lastDay < today ? lastDay : today,
      });
    });
    pages.push({ path: catalogPath(), priority: 0.8, changeFrequency: 'monthly', lastModified: CATALOGS_UPDATED });
    for (const c of CATALOGS) pages.push({ path: catalogPath(c), priority: 0.7, changeFrequency: 'monthly', lastModified: CATALOGS_UPDATED });
  }

  const guides = site.id === 'hub' ? allGuides().filter((g) => g.site === 'hub') : guidesFor(site.id);
  const listed = site.id === 'hub' ? allGuides() : guides;
  if (listed.length) pages.push({ path: guidePath(), priority: 0.7, changeFrequency: 'weekly', lastModified: listed[0].updated });
  for (const g of guides) pages.push({ path: guidePath(g), priority: 0.7, changeFrequency: 'monthly', lastModified: g.updated });

  return pages.map((p) => ({
    url: `${origin}${p.path === '/' ? '' : p.path}`,
    priority: p.priority,
    changeFrequency: p.changeFrequency,
    ...(p.lastModified ? { lastModified: p.lastModified } : {}),
  }));
}
