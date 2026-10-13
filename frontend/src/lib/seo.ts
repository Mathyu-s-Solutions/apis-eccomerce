import 'server-only';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { Site, SiteId } from './brands';

/**
 * Origen público del request: el dominio por el que entró el visitante (o el bot que arma
 * la vista previa del link). Cada sitio tiene su dominio, así que los links absolutos
 * (canonical, og:image, sitemap) salen de aquí y no de una URL fija.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000').split(',')[0].trim();
  const proto = h.get('x-forwarded-proto')?.split(',')[0].trim() ?? (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Favicon (SVG y PNG) e ícono de iOS de un sitio; los genera app/brand/[site]/[file]. */
export function siteIcons(id: SiteId): Metadata['icons'] {
  return {
    icon: [
      { url: `/brand/${id}/icon.png`, type: 'image/png', sizes: '32x32' },
      { url: `/brand/${id}/icon.svg`, type: 'image/svg+xml' },
    ],
    apple: [{ url: `/brand/${id}/apple-icon.png`, type: 'image/png', sizes: '180x180' }],
  };
}

/**
 * Metadata de una página pública: título, descripción, canonical y la tarjeta que se ve
 * al compartir el link (Open Graph y X). Sin `title`, queda el título por defecto del sitio.
 */
export function pageMetadata(site: Site, page: { title?: string; description: string; path: string }): Metadata {
  const fullTitle = page.title ? `${page.title} · ${site.name}` : `${site.name} — ${site.tagline}`;
  const image = { url: `/brand/${site.id}/og.png`, width: 1200, height: 630, alt: `${site.name}: ${site.heroTitle}` };
  return {
    ...(page.title ? { title: page.title } : {}),
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: {
      type: 'website',
      locale: 'es_PE',
      siteName: site.name,
      url: page.path,
      title: fullTitle,
      description: page.description,
      images: [image],
    },
    twitter: { card: 'summary_large_image', title: fullTitle, description: page.description, images: [image] },
  };
}

/** Panel, admin y similares: que no salgan en buscadores. */
export const NO_INDEX: Metadata['robots'] = { index: false, follow: false };

/** JSON-LD listo para un <script>: escapa `<` para que no cierre la etiqueta. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
