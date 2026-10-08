import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Boxes } from 'lucide-react';
import { HUB } from '@/lib/brands';
import { siteHref } from '@/lib/urls';
import { PanelFrame } from '@/components/site/panel-frame';

export const metadata: Metadata = { title: { default: HUB.name, template: `%s · ${HUB.name}` } };

// Una sola cuenta para todas las APIs: el ingreso es el del sitio central.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <PanelFrame>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link href={siteHref('hub')} className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg brand-mark">
            <Boxes size={20} />
          </span>
          {HUB.name}
        </Link>
        <p className="mb-8 text-center text-sm text-[var(--muted)]">Una cuenta para Shalom, Olva y SUNAT</p>
        {children}
      </main>
    </PanelFrame>
  );
}
