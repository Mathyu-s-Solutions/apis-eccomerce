import { SetMetadata } from '@nestjs/common';

export const BILLING_COST_KEY = 'billing:cost';

/**
 * Unidades de cuota que consume un endpoint si responde con éxito.
 * Por defecto 0 (gratis). Las lecturas cacheables (agencias, ubigeos) suelen
 * ser 0; tracking y cotización consumen 1.
 */
export const Cost = (units: number) => SetMetadata(BILLING_COST_KEY, units);
