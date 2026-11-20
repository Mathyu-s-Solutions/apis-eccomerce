'use client';

import { useState } from 'react';
import { formatSoles } from '@/lib/utils';

/** "nov." en hora de Lima (el mes empieza a medianoche de Lima). */
const monthShort = (iso: string) => new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'America/Lima' }).format(new Date(iso));
const monthLong = (iso: string) => new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'America/Lima' }).format(new Date(iso));

/** Tope redondo del eje: 1, 2 o 5 × 10^k. */
function niceMax(value: number): number {
  if (value <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].map((m) => m * pow).find((n) => n >= value))!;
}

/**
 * Ingresos aprobados por mes (una serie: sin leyenda, el título la nombra).
 * Columnas finas desde una base, valor del mes actual en su tope, el resto al
 * pasar el mouse o con el teclado (cada columna lleva su mes y monto para lectores de pantalla).
 */
export function RevenueChart({ series }: { series: { month: string; total: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const top = niceMax(Math.max(...series.map((s) => s.total)));
  const last = series.length - 1;
  const ticks = [top, top / 2, 0];

  return (
    // Margen arriba: la etiqueta de la columna más alta cae sobre el tope del gráfico.
    <figure className="mt-8">
      <div className="flex gap-2">
        {/* Eje: tres marcas redondas. */}
        <div aria-hidden className="flex h-32 w-12 shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-[var(--muted)]">
          {ticks.map((t) => <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{formatSoles(t)}</span>)}
        </div>
        <div className="relative h-32 flex-1">
          {ticks.map((t, i) => (
            <span key={t} aria-hidden className="absolute inset-x-0 h-px bg-[var(--border)]" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end justify-around">
            {series.map((s, i) => {
              const pct = (s.total / top) * 100;
              const shown = active === i || (active === null && i === last);
              return (
                <div
                  key={s.month}
                  tabIndex={0}
                  role="img"
                  aria-label={`${monthLong(s.month)}: ${formatSoles(s.total)}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="group relative flex h-full w-10 cursor-default items-end justify-center outline-none"
                >
                  {shown && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute z-10 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--foreground)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white"
                      style={{ bottom: `${pct}%` }}
                    >
                      {formatSoles(s.total)}
                    </span>
                  )}
                  <span
                    className="block w-6 rounded-t-[4px] transition-opacity group-focus-visible:ring-2 group-focus-visible:ring-[var(--accent)] group-focus-visible:ring-offset-2"
                    style={{
                      height: s.total > 0 ? `max(${pct}%, 3px)` : 0,
                      background: 'var(--accent)',
                      opacity: active === null || active === i ? 1 : 0.45,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex gap-2" aria-hidden>
        <span className="w-12 shrink-0" />
        <div className="flex flex-1 justify-around text-[11px] text-[var(--muted)]">
          {series.map((s, i) => <span key={s.month} className={`w-10 text-center ${i === last ? 'font-medium text-[var(--foreground)]' : ''}`}>{monthShort(s.month)}</span>)}
        </div>
      </div>
    </figure>
  );
}
