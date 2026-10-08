import type { Agency } from '../../common/courier/courier-adapter.interface';
import {
  mapStatusByKeywords,
  ShipmentStatus,
  type TrackingEvent,
  type TrackingResult,
} from '../../common/courier/tracking.model';

export function mapShalomAgency(a: Record<string, any>): Agency {
  return {
    code: String(a.ter_id ?? a.ter_abrebiatura ?? ''),
    name: a.nombre ?? a.lugar_over ?? a.zona,
    department: a.departamento,
    province: a.provincia,
    district: a.distrito,
    address: a.direccion,
    latitude: a.latitud ? Number(a.latitud) : undefined,
    longitude: a.longitud ? Number(a.longitud) : undefined,
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

export function mapShalomStatus(
  trackingNumber: string,
  statusMessage: string | undefined,
  data: Record<string, any> | null,
): TrackingResult {
  const events: TrackingEvent[] = [];
  if (data) {
    for (const [stage, status] of STAGE_ORDER) {
      const node = data[stage];
      if (node && (node.fecha || node === true)) {
        events.push({
          status,
          rawStatus: stage,
          at: typeof node === 'object' ? node.fecha : undefined,
        });
      }
    }
  }

  const status = events.length
    ? events.at(-1)!.status
    : mapStatusByKeywords(statusMessage);

  return {
    carrier: 'shalom',
    trackingNumber,
    status,
    events,
    raw: { message: statusMessage, data },
  };
}
