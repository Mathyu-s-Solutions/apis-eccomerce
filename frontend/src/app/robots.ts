import type { MetadataRoute } from 'next';
import { requestOrigin } from '@/lib/seo';

// Cada dominio publica su propio robots.txt y sitemap.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await requestOrigin();
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard', '/admin', '/api/', '/sitio/'] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
