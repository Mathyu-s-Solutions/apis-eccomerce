import type { TrackingResult } from './tracking.model';

export interface TrackQuery {
  orderNumber: string;
  orderCode?: string;
}

export interface Agency {
  code: string;
  name: string;
  department?: string;
  province?: string;
  district?: string;
  address?: string;
  ubigeo?: string;
  latitude?: number;
  longitude?: number;
  raw?: unknown;
}

/**
 * Contrato común de un courier. Cada adaptador (Shalom, Olva) lo implementa.
 * Mantener esta frontera estable es lo que nos deja, más adelante, extraer un
 * módulo a su propio servicio sin reescribir a los consumidores.
 */
export interface CourierAdapter {
  readonly carrier: 'shalom' | 'olva';
  track(query: TrackQuery): Promise<TrackingResult>;
  agencies(filter?: { q?: string; department?: string; province?: string }): Promise<Agency[]>;
}
