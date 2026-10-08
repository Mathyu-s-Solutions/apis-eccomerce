import type { Agency } from '../../common/courier/courier-adapter.interface';
import {
  mapStatusByKeywords,
  ShipmentStatus,
  type TrackingEvent,
  type TrackingResult,
} from '../../common/courier/tracking.model';
import type { OlvaStore } from './olva.upstream';

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
    raw: s,
  };
}

/**
 * Normaliza la respuesta de getTrackingInformation al modelo común.
 * La forma exacta del upstream se afina con datos reales; por eso guardamos
 * `raw` y mapeamos de forma defensiva.
 */
export function mapTracking(trackingNumber: string, raw: unknown): TrackingResult {
  const data = raw as Record<string, any> | null;
  const events: TrackingEvent[] = [];

  // Estructuras conocidas: a veces { data: { details: [...] } } o { details: [...] }.
  const details: any[] =
    data?.details ??
    data?.data?.details ??
    data?.payload?.details ??
    (Array.isArray(data?.data) ? data.data : []) ??
    [];

  for (const d of Array.isArray(details) ? details : []) {
    const statusText: string | undefined =
      d?.estado ?? d?.status ?? d?.descripcion ?? d?.nombre_estado;
    events.push({
      status: mapStatusByKeywords(statusText),
      rawStatus: statusText,
      description: d?.descripcion ?? d?.detalle ?? d?.observacion,
      location: d?.oficina ?? d?.lugar ?? d?.ubicacion,
      at: d?.fecha ?? d?.fecha_hora ?? d?.date,
    });
  }

  const headStatus: string | undefined =
    data?.nombre_estado_tracking ??
    data?.general?.nombre_estado_tracking ??
    data?.estado ??
    events.at(-1)?.rawStatus;

  const status = events.length
    ? (events.at(-1)!.status)
    : mapStatusByKeywords(headStatus) || ShipmentStatus.UNKNOWN;

  return {
    carrier: 'olva',
    trackingNumber,
    status,
    events,
    raw,
  };
}
