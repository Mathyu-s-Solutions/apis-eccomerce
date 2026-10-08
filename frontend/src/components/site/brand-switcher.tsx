'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { BrandId } from '@/lib/brands';

const OPTIONS: { id: BrandId; label: string }[] = [
  { id: 'shalom', label: 'Shalom' },
  { id: 'olva', label: 'Olva' },
  { id: 'sunat', label: 'SUNAT' },
];

export function BrandSwitcher({ current }: { current: BrandId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function pick(id: BrandId) {
    document.cookie = `mathyu_brand=${id}; path=/; max-age=${60 * 60 * 24 * 30}`;
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
        title="Ver otra marca (solo preview)"
      >
        Demo: {OPTIONS.find((o) => o.id === current)?.label}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-lg">
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
