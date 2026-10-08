/** Estado normalizado de un envío, común a todos los couriers. */
export enum ShipmentStatus {
  REGISTERED = 'REGISTERED',
  IN_TRANSIT = 'IN_TRANSIT',
  AT_DESTINATION = 'AT_DESTINATION',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
  INCIDENT = 'INCIDENT',
  UNKNOWN = 'UNKNOWN',
}

export interface TrackingEvent {
  status: ShipmentStatus;
  /** Texto original del courier, sin tocar. */
  rawStatus?: string;
  description?: string;
  location?: string;
  at?: string; // ISO 8601
}

export interface TrackingResult {
  carrier: 'shalom' | 'olva';
  trackingNumber: string;
  status: ShipmentStatus;
  events: TrackingEvent[];
  /** Respuesta cruda del upstream, por si el cliente la necesita. */
  raw?: unknown;
}

/**
 * Mapea texto libre de un courier a un estado normalizado por palabras clave.
 * Pensado para afinarse con datos reales de cada proveedor.
 */
export function mapStatusByKeywords(text: string | undefined | null): ShipmentStatus {
  if (!text) return ShipmentStatus.UNKNOWN;
  const t = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  const table: Array<[RegExp, ShipmentStatus]> = [
    [/entregad|delivered|recepcion conforme/, ShipmentStatus.DELIVERED],
    [/devoluc|returned|rezagad/, ShipmentStatus.RETURNED],
    [/reparto|out for delivery|en ruta|despachado a domicilio/, ShipmentStatus.OUT_FOR_DELIVERY],
    [/en destino|destino|at destination|llego a|disponible para recojo/, ShipmentStatus.AT_DESTINATION],
    [/transito|in transit|en camino|en viaje|despachado/, ShipmentStatus.IN_TRANSIT],
    [/incidencia|observad|motivad|demora|incident/, ShipmentStatus.INCIDENT],
    [/registrad|origen|recepcionad|en oficina de origen|generad/, ShipmentStatus.REGISTERED],
  ];

  for (const [re, status] of table) {
    if (re.test(t)) return status;
  }
  return ShipmentStatus.UNKNOWN;
}
