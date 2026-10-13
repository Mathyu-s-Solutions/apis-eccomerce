import { SetMetadata } from '@nestjs/common';

export const BILLING_COST_KEY = 'billing:cost';

/** Unidades según la request (p. ej. una por guía de un lote, o 0 en un entorno de pruebas). */
export type CostFn = (req: { body?: unknown; query?: unknown; [key: string]: unknown }) => number;

/**
 * Unidades de cuota que consume un endpoint si responde con éxito.
 * Por defecto 0 (gratis). Las lecturas cacheables (agencias, ubigeos) suelen
 * ser 0; tracking y cotización consumen 1.
 */
export const Cost = (units: number | CostFn) => SetMetadata(BILLING_COST_KEY, units);

/** Lo que cobra una request: el número fijo o el de la función (1 si no devuelve un número). */
export function costOf(units: number | CostFn | undefined, req: { body?: unknown; query?: unknown }): number {
  if (typeof units === 'function') {
    const n = Math.floor(units(req));
    return Number.isFinite(n) ? Math.max(0, n) : 1;
  }
  return units ?? 0;
}
