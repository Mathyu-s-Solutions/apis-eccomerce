import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { Fira_Sans, Geist_Mono, Inter, Roboto } from 'next/font/google';
import './globals.css';
import { getBrand } from '@/lib/brand-server';
import type { BrandTheme } from '@/lib/brands';

// Cada marca usa la tipografía de su web oficial. La marca se resuelve por request, así que
// ninguna se precarga: se descarga solo la que el CSS termina usando.
const fira = Fira_Sans({ variable: '--font-fira', subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], preload: false });
const inter = Inter({ variable: '--font-inter', subsets: ['latin'], preload: false });
const roboto = Roboto({ variable: '--font-roboto', subsets: ['latin'], weight: ['400', '500', '700', '900'], preload: false });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
    description: brand.heroSubtitle,
  };
}

function themeVars(t: BrandTheme): CSSProperties {
  return {
    '--font-brand': `var(--font-${t.font})`,
    '--foreground': t.foreground,
    '--muted': t.muted,
    '--primary': t.primary,
    '--primary-hover': t.primaryHover,
    '--on-primary': t.onPrimary,
    '--accent': t.accent,
    '--accent-soft': t.accentSoft,
    '--signature': t.signature,
    '--on-signature': t.onSignature,
    '--mark': t.mark,
    '--on-mark': t.onMark,
    '--header': t.header,
    '--on-header': t.onHeader,
    '--dark': t.dark,
    '--darker': t.darker,
    '--on-dark-muted': t.onDarkMuted,
    '--tint': t.tint,
    '--section': t.section,
  } as CSSProperties;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const brand = await getBrand();

  return (
    <html
      lang="es"
      className={`${fira.variable} ${inter.variable} ${roboto.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full" style={themeVars(brand.theme)}>
        <div className="flex min-h-screen flex-col">{children}</div>
      </body>
    </html>
  );
}
