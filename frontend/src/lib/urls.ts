import { getSiteById, type SiteId } from './brands';

/**
 * Panel central (cuenta, keys y pagos de todas las APIs). Con dominios propios,
 * NEXT_PUBLIC_PANEL_URL (p. ej. https://app.mathyu.dev): las landings de cada API
 * mandan ahí y proxy.ts redirige el panel de los otros dominios. Sin él (preview
 * en un solo dominio), todo es relativo.
 */
export const PANEL_URL = (process.env.NEXT_PUBLIC_PANEL_URL ?? '').replace(/\/+$/, '');

export function panelHref(path: string): string {
  return `${PANEL_URL}${path}`;
}

/** Pagar un plan de una API (o un pack) desde cualquier landing. */
export function billingHref(choice: { product: string; plan: string } | { bundle: string }): string {
  const qs = 'bundle' in choice ? `bundle=${choice.bundle}` : `product=${choice.product}&plan=${choice.plan}`;
  return panelHref(`/dashboard/billing?${qs}`);
}

/**
 * Landing de un sitio. Con dominios propios, su dominio; sin ellos, /sitio/<id>,
 * que elige el sitio con la misma cookie que el switcher de preview.
 */
export function siteHref(id: SiteId, path = '/'): string {
  if (PANEL_URL) return `https://${getSiteById(id).hosts[0]}${path}`;
  return path === '/' ? `/sitio/${id}` : `/sitio/${id}?next=${encodeURIComponent(path)}`;
}
