import type { TrackingResult } from './tracking.model';

export interface TrackQuery {
  orderNumber: string;
  orderCode?: string;
}

export const WEEK_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** Horario de un día en hora de Lima ("08:00"). `null` = cerrado ese día. */
export interface DaySchedule {
  open: string | null;
  close: string | null;
}
export type WeekSchedule = Record<WeekDay, DaySchedule>;

export interface Agency {
  code: string;
  name: string;
  department?: string;
  province?: string;
  district?: string;
  address?: string;
  /** Ubigeo del INEI (6 dígitos). */
  ubigeo?: string;
  latitude?: number;
  longitude?: number;
  /** Horario por día; `null` si el courier no lo informa. */
  schedule: WeekSchedule | null;
  /** `false` = la agencia solo despacha: no se puede elegir como destino. */
  receivesShipments: boolean;
  raw?: unknown;
}

/**
 * Contrato común de un courier. Cada adaptador (Shalom, Olva) lo implementa.
 * Mantener esta frontera estable es lo que nos deja, más adelante, extraer un
 * módulo a su propio servicio sin reescribir a los consumidores.
 */
export interface CourierAdapter {
  readonly carrier: 'shalom' | 'olva';
  /** `null` = el courier no tiene esa guía. */
  track(query: TrackQuery): Promise<TrackingResult | null>;
  agencies(filter?: { q?: string; department?: string; province?: string }): Promise<Agency[]>;
}
