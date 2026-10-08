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
  /** Hora de Lima, como la da el courier: "2026-09-24 20:14:33" o solo "2026-09-23". */
  at?: string;
}

export interface TrackingResult {
  carrier: 'shalom' | 'olva';
  trackingNumber: string;
  status: ShipmentStatus;
  delivered: boolean;
  /** Hora de Lima de la entrega, si ya se entregó. */
  deliveredAt: string | null;
  /** Tiempo estimado de llegada en texto del courier ("24 horas"), mientras no se entrega. */
  transitTime: string | null;
  /** Ciudad o agencia de destino según el courier. */
  destination: string | null;
  /** Del más antiguo al más reciente. */
  events: TrackingEvent[];
  /** Respuesta cruda del upstream: solo con `?raw=1` (trae datos personales). */
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
    [/devoluc|devuelt|returned|rezagad/, ShipmentStatus.RETURNED],
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

const PROGRESS: ShipmentStatus[] = [
  ShipmentStatus.REGISTERED,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.AT_DESTINATION,
  ShipmentStatus.OUT_FOR_DELIVERY,
  ShipmentStatus.DELIVERED,
];

/**
 * Estado del envío según sus eventos (del más antiguo al más reciente): el más
 * avanzado, salvo que el último sea una devolución o una incidencia. Así un
 * evento ambiguo al final (Olva repite "ASIGNADO" en destino) no lo hace retroceder.
 */
export function overallStatus(events: TrackingEvent[]): ShipmentStatus {
  const last = events.at(-1)?.status;
  if (last === ShipmentStatus.RETURNED || last === ShipmentStatus.INCIDENT) return last;
  const furthest = Math.max(-1, ...events.map((e) => PROGRESS.indexOf(e.status)));
  return furthest >= 0 ? PROGRESS[furthest] : ShipmentStatus.UNKNOWN;
}
