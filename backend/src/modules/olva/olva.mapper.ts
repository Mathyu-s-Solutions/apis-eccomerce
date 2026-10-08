import {
  type Agency,
  WEEK_DAYS,
  type WeekSchedule,
} from '../../common/courier/courier-adapter.interface';
import {
  mapStatusByKeywords,
  overallStatus,
  ShipmentStatus,
  type TrackingEvent,
  type TrackingResult,
} from '../../common/courier/tracking.model';
import type { OlvaStore } from './olva.upstream';

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim() : undefined;
const hhmm = (v: unknown): string | null => text(v)?.slice(0, 5) ?? null;

/** `horario` ya viene por día: { monday: { open: "08:00", close: "19:00" }, … }. */
function olvaSchedule(horario: unknown): WeekSchedule | null {
  if (!horario || typeof horario !== 'object') return null;
  const days = horario as Record<string, { open?: unknown; close?: unknown } | null>;
  let open = false;
  const schedule = {} as WeekSchedule;
  for (const day of WEEK_DAYS) {
    const from = hhmm(days[day]?.open);
    const to = hhmm(days[day]?.close);
    schedule[day] = from && to ? { open: from, close: to } : { open: null, close: null };
    open ||= !!(from && to);
  }
  return open ? schedule : null;
}

export function mapStore(s: OlvaStore): Agency {
  return {
    code: s.office_id,
    name: s.nombres?.trim(),
    department: s.department,
    province: s.province,
    district: s.district,
    address: s.direccion?.trim(),
    ubigeo: s.ubigeo,
    latitude: s.lat ? Number(s.lat) : undefined,
    longitude: s.lng ? Number(s.lng) : undefined,
    schedule: olvaSchedule(s.horario),
    // get_olva_stores solo lista tiendas (tipo "TIENDAS"): todas reciben envíos.
    receivesShipments: true,
    raw: s,
  };
}

/**
 * `estado_tracking` de Olva, visto en guías reales. Lo que no está aquí pasa
 * por las palabras clave comunes.
 */
const OLVA_STATUS: Record<string, ShipmentStatus> = {
  REGISTRADO: ShipmentStatus.REGISTERED,
  'RECEPCION TIENDA': ShipmentStatus.REGISTERED,
  'TRACKING EN GUIA': ShipmentStatus.REGISTERED,
  'TRACKING EN TRANSPORTE': ShipmentStatus.REGISTERED,
  'RECEPCION GUIA': ShipmentStatus.REGISTERED,
  'PRE VALIJA': ShipmentStatus.REGISTERED,
  'EN VALIJA': ShipmentStatus.REGISTERED,
  DESPACHADO: ShipmentStatus.IN_TRANSIT,
  // Asignado a una ruta: sale en origen (hacia el destino) y en destino (antes de entregar).
  ASIGNADO: ShipmentStatus.UNKNOWN,
  'CONFIRMACION EN TIENDA': ShipmentStatus.AT_DESTINATION,
  ENTREGADO: ShipmentStatus.DELIVERED,
};

export function mapOlvaStatus(value: string | undefined): ShipmentStatus {
  const key = (value ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return OLVA_STATUS[key] ?? mapStatusByKeywords(value);
}

/** "HUARI (HRZ)" → "HUARI": el código de la sede no le sirve al cliente. */
const place = (v: unknown): string | undefined =>
  text(v)?.replace(/\s*\([A-Z0-9]{2,5}\)$/, '') || undefined;

/**
 * Normaliza getTrackingInformation al modelo común. De cada paso solo se copian
 * estado, fecha y sede: `obs` y `general` traen remitente, destinatario y
 * contenido (quedan en `raw`, que solo sale con ?raw=1).
 */
export function mapTracking(trackingNumber: string, raw: Record<string, any> | null): TrackingResult {
  const data = raw?.data ?? {};
  const general = (data.general ?? {}) as Record<string, any>;
  const details: Record<string, any>[] = Array.isArray(data.details) ? data.details : [];

  let events: TrackingEvent[] = details.map((d) => {
    const rawStatus = text(d?.estado_tracking);
    return {
      status: mapOlvaStatus(rawStatus),
      rawStatus,
      location: place(d?.nombre_sede),
      at: text(d?.fecha_creacion),
    };
  });
  // Olva los manda del más reciente al más antiguo (con solo la fecha, sin hora).
  const first = events[0]?.at ?? '';
  const last = events.at(-1)?.at ?? '';
  if (events.length > 1 && !(first < last)) events = events.reverse();

  const status = events.length
    ? overallStatus(events)
    : mapOlvaStatus(text(general.nombre_estado_tracking));
  const delivered = status === ShipmentStatus.DELIVERED;

  return {
    carrier: 'olva',
    trackingNumber,
    status,
    delivered,
    deliveredAt: delivered
      ? (events.findLast((e) => e.status === ShipmentStatus.DELIVERED)?.at ?? null)
      : null,
    transitTime: null,
    destination: place(general.destino) ?? null,
    events,
    raw,
  };
}
