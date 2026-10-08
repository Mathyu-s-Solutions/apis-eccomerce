import { NextResponse, type NextRequest } from 'next/server';

/**
 * Con dominios propios (NEXT_PUBLIC_PANEL_URL), el panel vive en un solo dominio:
 * entrar, registrarse, el panel y el admin desde la landing de una API mandan ahí.
 * Así hay una sola sesión para todas las APIs. Sin la variable, no hace nada.
 */
export function proxy(request: NextRequest) {
  const panel = process.env.NEXT_PUBLIC_PANEL_URL;
  if (!panel) return NextResponse.next();
  const target = new URL(panel);
  const host = (request.headers.get('host') ?? '').toLowerCase();
  if (host === target.host.toLowerCase()) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(new URL(`${pathname}${search}`, target), 307);
}

export const config = {
  matcher: ['/login', '/register', '/dashboard/:path*', '/admin/:path*'],
};
