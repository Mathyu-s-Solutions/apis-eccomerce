import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Fira_Sans, Geist_Mono, Inter, Roboto } from 'next/font/google';
import './globals.css';
import { getSite } from '@/lib/brand-server';
import { themeVars } from '@/lib/theme';

// Cada marca usa la tipografía de su web oficial. La marca se resuelve por request, así que
// ninguna se precarga: se descarga solo la que el CSS termina usando.
const fira = Fira_Sans({ variable: '--font-fira', subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], preload: false });
const inter = Inter({ variable: '--font-inter', subsets: ['latin'], preload: false });
const roboto = Roboto({ variable: '--font-roboto', subsets: ['latin'], weight: ['400', '500', '700', '900'], preload: false });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return {
    title: { default: `${site.name} — ${site.tagline}`, template: `%s · ${site.name}` },
    description: site.heroSubtitle,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const site = await getSite();

  return (
    <html
      lang="es"
      className={`${fira.variable} ${inter.variable} ${roboto.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full" style={themeVars(site.theme)}>
        <div className="flex min-h-screen flex-col">{children}</div>
      </body>
    </html>
  );
}
