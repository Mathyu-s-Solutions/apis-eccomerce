import type { DayLevel } from '@/lib/status';

/**
 * Color de cada día en las barras y en la leyenda. Vive aparte porque lo usan la página
 * (servidor) y las barras (cliente): un valor exportado desde un módulo 'use client' llega
 * al servidor como referencia, no como objeto.
 */
export const DAY_COLORS: Record<DayLevel, string> = {
  up: 'bg-emerald-500',
  minor: 'bg-amber-400',
  major: 'bg-red-500',
  none: 'bg-slate-200',
};
