import type { ReactNode } from 'react';
import { HUB } from '@/lib/brands';
import { themeVars } from '@/lib/theme';

/**
 * El panel (cuenta, keys, pagos y admin) es uno solo para todas las APIs: va
 * siempre con el tema del sitio central, entres desde la landing que entres.
 */
export function PanelFrame({ children }: { children: ReactNode }) {
  return (
    <div style={themeVars(HUB.theme)} className="flex flex-1 flex-col bg-white font-sans text-[var(--foreground)]">
      {children}
    </div>
  );
}
