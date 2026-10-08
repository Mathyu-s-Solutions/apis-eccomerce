import 'server-only';
import { cookies, headers } from 'next/headers';
import { BRANDS, brandByHost, DEFAULT_BRAND, type Brand, type BrandId, BRAND_IDS } from './brands';

const BRAND_COOKIE = 'mathyu_brand';

/**
 * Resuelve la marca activa:
 *  1. por dominio (producción: cada marca su dominio),
 *  2. por cookie (preview en un solo dominio, con el switcher),
 *  3. default.
 */
export async function getBrandId(): Promise<BrandId> {
  const h = await headers();
  const byHost = brandByHost(h.get('host'));
  if (byHost) return byHost;

  const store = await cookies();
  const c = store.get(BRAND_COOKIE)?.value as BrandId | undefined;
  if (c && BRAND_IDS.includes(c)) return c;

  return DEFAULT_BRAND;
}

export async function getBrand(): Promise<Brand> {
  return BRANDS[await getBrandId()];
}

/** True si la marca viene del dominio (en prod no mostramos el switcher). */
export async function isBrandFromHost(): Promise<boolean> {
  const h = await headers();
  return brandByHost(h.get('host')) !== null;
}

export { BRAND_COOKIE };
