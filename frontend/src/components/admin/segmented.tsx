'use client';

import { cn } from '@/lib/utils';

/** Botones juntos para elegir una opción (meses, método de pago…). */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
            o.value === value ? 'bg-white text-[var(--foreground)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--foreground)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
