'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { DayBar } from '@/lib/status';
import { DAY_COLORS } from './day-colors';

/** En el móvil se ven los últimos 30 días; desde sm, los 90. */
const MOBILE_DAYS = 30;

/**
 * Un día por barra, del más antiguo a hoy. Al pasar el mouse (o tocar en el móvil) se lee
 * el detalle del día debajo, en vez de un tooltip que se saldría de la pantalla.
 */
export function UptimeBars({ days, name, uptime }: { days: DayBar[]; name: string; uptime: string | null }) {
  const [active, setActive] = useState<number | null>(null);
  const firstMobile = days.length - MOBILE_DAYS;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Disponibilidad de ${name} en los últimos ${days.length} días: ${uptime ?? 'sin datos'}`}
        className="flex h-9 items-stretch gap-[2px]"
        onPointerLeave={() => setActive(null)}
      >
        {days.map((d, i) => (
          <span
            key={d.date}
            className={cn(
              'flex-1 rounded-[3px] transition-opacity',
              DAY_COLORS[d.level],
              i < firstMobile && 'hidden sm:block',
              active !== null && active !== i && 'opacity-60',
            )}
            onPointerEnter={() => setActive(i)}
            onClick={() => setActive(i)}
          />
        ))}
      </div>
      <div className="min-h-5 text-xs text-[var(--muted)]" aria-hidden>
        {active !== null ? (
          <p className="font-medium text-[var(--foreground)]">{days[active].label}</p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="sm:hidden">Hace {MOBILE_DAYS} días</span>
              <span className="hidden sm:inline">Hace {days.length} días</span>
            </span>
            <span className="h-px flex-1 bg-[var(--border)]" />
            {uptime ? (
              <span>
                {uptime} <span className="sm:hidden">en {days.length} días</span>
                <span className="hidden sm:inline">disponible</span>
              </span>
            ) : (
              <span>Sin datos</span>
            )}
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span>Hoy</span>
          </div>
        )}
      </div>
    </div>
  );
}
