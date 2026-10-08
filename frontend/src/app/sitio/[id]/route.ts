import { NextResponse } from 'next/server';
import { SITE_IDS, type SiteId } from '@/lib/brands';
import { BRAND_COOKIE } from '@/lib/brand-server';

/**
 * Abre la landing de un sitio en un solo dominio (preview, sin dominios propios):
 * guarda el sitio en la misma cookie que el switcher y vuelve a `next`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const next = url.searchParams.get('next') ?? '/';
  // Solo rutas del mismo sitio: nada de //otro-dominio.
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const res = NextResponse.redirect(new URL(target, url));
  if (SITE_IDS.includes(id as SiteId)) {
    res.cookies.set(BRAND_COOKIE, id, { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' });
  }
  return res;
}
