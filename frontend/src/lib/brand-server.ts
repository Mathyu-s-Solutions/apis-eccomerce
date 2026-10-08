import 'server-only';
import { cookies, headers } from 'next/headers';
import { DEFAULT_SITE, getSiteById, siteByHost, SITE_IDS, type Site, type SiteId } from './brands';

const BRAND_COOKIE = 'mathyu_brand';

/**
 * Resuelve el sitio activo (landing central o la de una API):
 *  1. por dominio (producción: cada sitio su dominio),
 *  2. por cookie (preview en un solo dominio, con el switcher),
 *  3. la landing central.
 */
export async function getSiteId(): Promise<SiteId> {
  const h = await headers();
  const byHost = siteByHost(h.get('host'));
  if (byHost) return byHost;

  const store = await cookies();
  const c = store.get(BRAND_COOKIE)?.value as SiteId | undefined;
  if (c && SITE_IDS.includes(c)) return c;

  return DEFAULT_SITE;
}

export async function getSite(): Promise<Site> {
  return getSiteById(await getSiteId());
}

/** True si el sitio viene del dominio (en prod no mostramos el switcher). */
export async function isSiteFromHost(): Promise<boolean> {
  const h = await headers();
  return siteByHost(h.get('host')) !== null;
}

export { BRAND_COOKIE };
