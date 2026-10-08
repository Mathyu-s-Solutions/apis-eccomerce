'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CodeTab {
  id: string;
  label: string;
  request: ReactNode;
  responseLabel: string;
  response: ReactNode;
}

const pre = 'code-scroll overflow-x-auto whitespace-pre px-6 font-mono text-sm leading-7 text-[#DDE2F2]';

/** Panel oscuro con pestañas de petición/respuesta. */
export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(tabs[0].id);
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="overflow-hidden rounded-[20px] bg-[var(--darker)] shadow-[0_40px_80px_-40px_rgba(25,35,74,.7)]">
      <div role="tablist" aria-label="Ejemplos de código" className="flex flex-wrap gap-1.5 border-b border-white/10 p-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === active}
            onClick={() => setActive(t.id)}
            className={cn(
              'rounded-lg px-3.5 py-2.5 font-medium transition-colors',
              t.id === active ? 'bg-[var(--signature)] text-[var(--on-signature)]' : 'text-[#A9B1D3] hover:text-white',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <pre className={cn(pre, 'py-5')}>{tab.request}</pre>
        <p className="border-t border-dashed border-white/15 px-6 pt-1.5 text-xs text-[#8C96C4]">{tab.responseLabel}</p>
        <pre className={cn(pre, 'pb-6 pt-2.5')}>{tab.response}</pre>
      </div>
    </div>
  );
}
