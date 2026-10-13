import type { MetadataRoute } from 'next';
import { getSite } from '@/lib/brand-server';
import { requestOrigin } from '@/lib/seo';

/** Páginas públicas del sitio del dominio (la central o la de una API). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [site, origin] = await Promise.all([getSite(), requestOrigin()]);
  const pages: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/docs', priority: site.id === 'hub' ? 0.6 : 0.8, changeFrequency: 'monthly' },
    // El registro vive en el panel (con dominios propios, solo en el dominio central).
    ...(site.id === 'hub' ? [{ path: '/register', priority: 0.5, changeFrequency: 'yearly' as const }] : []),
    { path: '/terminos', priority: 0.2, changeFrequency: 'yearly' },
    { path: '/privacidad', priority: 0.2, changeFrequency: 'yearly' },
  ];
  return pages.map((p) => ({ url: `${origin}${p.path === '/' ? '' : p.path}`, priority: p.priority, changeFrequency: p.changeFrequency }));
}
