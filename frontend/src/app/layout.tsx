import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { getBrand } from '@/lib/brand-server';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
    description: brand.heroSubtitle,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const brand = await getBrand();
  const themeVars = {
    '--accent': brand.accent,
    '--accent-soft': brand.accentSoft,
    '--gradient-from': brand.gradientFrom,
    '--gradient-to': brand.gradientTo,
  } as CSSProperties;

  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div style={themeVars} className="flex min-h-screen flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
