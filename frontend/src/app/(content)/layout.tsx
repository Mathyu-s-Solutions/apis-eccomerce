import type { ReactNode } from 'react';
import { getSite } from '@/lib/brand-server';
import { Header } from '@/components/site/header';
import { Footer } from '@/components/site/footer';

/**
 * Páginas de contenido para buscadores (agencias, tipo de cambio, catálogos, guías): mismo
 * header y footer que (marketing), pero sin loading.tsx. Así la respuesta no se transmite
 * antes de saber si la página existe, y una URL vieja o mal escrita devuelve un 404 o un
 * 308 de verdad (con loading.tsx sería un 200 con noindex o un meta refresh).
 */
export default async function ContentLayout({ children }: { children: ReactNode }) {
  const site = await getSite();
  return (
    <>
      <Header site={site} />
      <main className="flex-1">{children}</main>
      <Footer site={site} />
    </>
  );
}
