import { Suspense, type ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Fira_Sans, Geist_Mono, Inter, Roboto } from 'next/font/google';
import './globals.css';
import { getSite } from '@/lib/brand-server';
import { requestOrigin, siteIcons } from '@/lib/seo';
import { themeVars } from '@/lib/theme';
import { NavigationProgress } from '@/components/site/navigation-progress';

// Cada marca usa la tipografía de su web oficial. La marca se resuelve por request, así que
// ninguna se precarga: se descarga solo la que el CSS termina usando.
const fira = Fira_Sans({ variable: '--font-fira', subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], preload: false });
const inter = Inter({ variable: '--font-inter', subsets: ['latin'], preload: false });
const roboto = Roboto({ variable: '--font-roboto', subsets: ['latin'], weight: ['400', '500', '700', '900'], preload: false });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  const [site, origin] = await Promise.all([getSite(), requestOrigin()]);
  const title = `${site.name} — ${site.tagline}`;
  const image = { url: `/brand/${site.id}/og.png`, width: 1200, height: 630, alt: `${site.name}: ${site.heroTitle}` };
  // Las páginas públicas lo completan con su canonical y su título (lib/seo.ts pageMetadata).
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: `%s · ${site.name}` },
    description: site.heroSubtitle,
    applicationName: site.name,
    authors: [{ name: "Mathyu's Solutions" }],
    creator: "Mathyu's Solutions",
    publisher: "Mathyu's Solutions",
    category: 'technology',
    icons: siteIcons(site.id),
    openGraph: { type: 'website', locale: 'es_PE', siteName: site.name, title, description: site.heroSubtitle, images: [image] },
    twitter: { card: 'summary_large_image', title, description: site.heroSubtitle, images: [image] },
    formatDetection: { telephone: false },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const site = await getSite();
  // Barra del navegador en el móvil con el color del header de la marca.
  return { themeColor: site.theme.header };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const site = await getSite();

  return (
    <html
      lang="es"
      className={`${fira.variable} ${inter.variable} ${roboto.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full" style={themeVars(site.theme)}>
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <div className="flex min-h-screen flex-col">{children}</div>
      </body>
    </html>
  );
}
