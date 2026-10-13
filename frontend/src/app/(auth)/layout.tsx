import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Boxes } from 'lucide-react';
import { HUB } from '@/lib/brands';
import { siteIcons } from '@/lib/seo';
import { PanelFrame } from '@/components/site/panel-frame';
import { SiteLink } from '@/components/site/site-link';

export const metadata: Metadata = {
  title: { default: HUB.name, template: `%s · ${HUB.name}` },
  description: 'Ingresa o crea tu cuenta para usar Shalom API, Olva API y SUNAT API desde un solo panel.',
  icons: siteIcons('hub'),
};

// Una sola cuenta para todas las APIs: el ingreso es el del sitio central.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <PanelFrame>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <SiteLink site="hub" className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg brand-mark">
            <Boxes size={20} />
          </span>
          {HUB.name}
        </SiteLink>
        <p className="mb-8 text-center text-sm text-[var(--muted)]">Una cuenta para Shalom, Olva y SUNAT</p>
        {children}
      </main>
    </PanelFrame>
  );
}
