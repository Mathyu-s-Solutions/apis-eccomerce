'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { SiteId } from '@/lib/brands';

const OPTIONS: { id: SiteId; label: string }[] = [
  { id: 'hub', label: 'Central' },
  { id: 'shalom', label: 'Shalom' },
  { id: 'olva', label: 'Olva' },
  { id: 'sunat', label: 'SUNAT' },
];

export function BrandSwitcher({ current }: { current: SiteId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // La página se vuelve a armar en el servidor con la otra marca: mientras, el botón gira.
  const [switching, startTransition] = useTransition();

  function pick(id: SiteId) {
    document.cookie = `mathyu_brand=${id}; path=/; max-age=${60 * 60 * 24 * 30}`;
    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-black/15 px-2.5 py-1.5 text-xs font-medium text-[var(--on-header)] hover:bg-black/6"
        title="Ver otra marca (solo preview)"
      >
        <span className="hidden sm:inline">Demo:</span> {OPTIONS.find((o) => o.id === current)?.label}
        {switching ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-xl border border-[var(--border)] bg-white text-[var(--foreground)] shadow-lg">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => pick(o.id)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
