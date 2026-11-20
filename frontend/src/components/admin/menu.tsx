'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** Botón "⋯" con un menú de acciones. Cierra con Esc, con un clic fuera o al elegir. */
export function ActionsMenu({ items, label = 'Más acciones' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const visible = items.filter((i) => !i.hidden);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-white text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-white py-1 shadow-lg">
          {visible.map((i) => (
            <button
              key={i.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); i.onSelect(); }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[var(--surface)]',
                i.danger ? 'text-red-600' : 'text-[var(--foreground)]',
              )}
            >
              <span className={cn('shrink-0', i.danger ? 'text-red-500' : 'text-[var(--muted)]')}>{i.icon}</span>
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
