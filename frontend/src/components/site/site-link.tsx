import type { ComponentProps } from 'react';
import type { SiteId } from '@/lib/brands';
import { siteHref } from '@/lib/urls';

/**
 * Link a la landing de un sitio (o a una página suya). Es un <a> normal, con carga completa:
 * cambia la marca, el tema y, con dominios propios, el dominio. Un <Link> lo precargaría, y
 * en preview la precarga de /sitio/<id> ya cambia la cookie de la marca sin que hagas clic.
 */
export function SiteLink({ site, path, ...props }: { site: SiteId; path?: string } & Omit<ComponentProps<'a'>, 'href'>) {
  return <a href={siteHref(site, path)} {...props} />;
}
