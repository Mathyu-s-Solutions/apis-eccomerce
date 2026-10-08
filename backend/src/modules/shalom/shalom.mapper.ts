import type {
  Agency,
  DaySchedule,
  WeekSchedule,
} from '../../common/courier/courier-adapter.interface';
import {
  mapStatusByKeywords,
  ShipmentStatus,
  type TrackingEvent,
  type TrackingResult,
} from '../../common/courier/tracking.model';

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim() : undefined;

/** "08:00:00" → "08:00". */
const hhmm = (v: unknown): string | null => text(v)?.slice(0, 5) ?? null;
const day = (open: unknown, close: unknown): DaySchedule =>
  hhmm(open) && hhmm(close) ? { open: hhmm(open), close: hhmm(close) } : { open: null, close: null };

/** Shalom da un horario de lunes a viernes, otro del sábado y otro del domingo. */
function shalomSchedule(a: Record<string, any>): WeekSchedule | null {
  const weekday = day(a.horario_atencion_lunes_inicio, a.horario_atencion_lunes_fin);
  if (!weekday.open) return null;
  return {
    monday: weekday,
    tuesday: weekday,
    wednesday: weekday,
    thursday: weekday,
    friday: weekday,
    saturday: day(a.horario_atencion_sabado_inicio, a.horario_atencion_sabado_fin),
    sunday: day(a.horario_atencion_domingo_inicio, a.horario_atencion_domingo_fin),
  };
}

export function mapShalomAgency(a: Record<string, any>): Agency {
  // `nombre` = "DEPARTAMENTO / PROVINCIA / DISTRITO / LUGAR"; el distrito es `zona`.
  const parts = String(a.nombre ?? '').split('/').map((s) => s.trim());
  const ubigeo = Number(a.ubi_id);
  return {
    code: String(a.ter_id ?? a.ter_abrebiatura ?? ''),
    name: text(a.lugar_over) ?? text(a.lugar) ?? text(parts.slice(3).join(' / ')) ?? text(a.zona) ?? '',
    department: text(a.departamento) ?? parts[0],
    province: text(a.provincia) ?? parts[1],
    district: text(a.zona) ?? parts[2],
    address: text(a.direccion),
    ubigeo: ubigeo > 0 ? String(ubigeo).padStart(6, '0') : undefined,
    latitude: a.latitud ? Number(a.latitud) : undefined,
    longitude: a.longitud ? Number(a.longitud) : undefined,
    schedule: shalomSchedule(a),
    receivesShipments: Number(a.destino) === 1,
    raw: a,
  };
}

/**
 * La respuesta de rastrea/estados es un objeto con hitos fechados:
 * { registrado, origen, transito, destino, reparto, entregado, demora }.
 */
const STAGE_ORDER: Array<[string, ShipmentStatus]> = [
  ['registrado', ShipmentStatus.REGISTERED],
  ['origen', ShipmentStatus.REGISTERED],
  ['transito', ShipmentStatus.IN_TRANSIT],
  ['destino', ShipmentStatus.AT_DESTINATION],
  ['reparto', ShipmentStatus.OUT_FOR_DELIVERY],
  ['entregado', ShipmentStatus.DELIVERED],
];

/** Lo que usamos de rastrea/buscar (el resto son datos del envío y de las personas). */
export interface ShalomSearch {
  entregado?: unknown;
  tiempo_llegada?: unknown;
}

/**
 * Con `search` (rastreo por guía) manda su `entregado`: el hito "entregado" solo
 * cuenta si Shalom dice que se entregó. Sin él (rastreo por ose_id), basta la fecha.
 */
export function mapShalomStatus(
  trackingNumber: string,
  statusMessage: string | undefined,
  data: Record<string, any> | null,
  search?: ShalomSearch,
): TrackingResult {
  const delivered = search
    ? search.entregado === true
    : !!(data?.entregado && (data.entregado.fecha || data.entregado === true));

  const events: TrackingEvent[] = [];
  if (data) {
    for (const [stage, status] of STAGE_ORDER) {
      const node = data[stage];
      if (!node || !(node.fecha || node === true)) continue;
      if (stage === 'entregado' && !delivered) continue;
      events.push({
        status,
        rawStatus: stage,
        at: typeof node === 'object' ? node.fecha : undefined,
      });
    }
  }

  const status = events.length
    ? events.at(-1)!.status
    : mapStatusByKeywords(statusMessage);

  return {
    carrier: 'shalom',
    trackingNumber,
    status,
    delivered,
    deliveredAt: delivered ? (text(data?.entregado?.fecha) ?? null) : null,
    transitTime: delivered ? null : (text(search?.tiempo_llegada) ?? null),
    // Ni rastrea/buscar ni rastrea/estados dicen el destino.
    destination: null,
    events,
    raw: { message: statusMessage, data },
  };
}
