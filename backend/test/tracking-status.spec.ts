import { describe, expect, it } from 'vitest';
import {
  mapStatusByKeywords,
  overallStatus,
  ShipmentStatus,
} from '../src/common/courier/tracking.model';
import { mapOlvaStatus, mapTracking } from '../src/modules/olva/olva.mapper';
import { mapShalomStatus } from '../src/modules/shalom/shalom.mapper';

describe('mapStatusByKeywords', () => {
  it('reconoce estados en español con y sin tildes', () => {
    expect(mapStatusByKeywords('ENTREGADO')).toBe(ShipmentStatus.DELIVERED);
    expect(mapStatusByKeywords('En tránsito')).toBe(ShipmentStatus.IN_TRANSIT);
    expect(mapStatusByKeywords('EN REPARTO A DOMICILIO')).toBe(
      ShipmentStatus.OUT_FOR_DELIVERY,
    );
    expect(mapStatusByKeywords('En destino')).toBe(
      ShipmentStatus.AT_DESTINATION,
    );
    expect(mapStatusByKeywords('Devolución al remitente')).toBe(
      ShipmentStatus.RETURNED,
    );
    expect(mapStatusByKeywords('DEVUELTO')).toBe(ShipmentStatus.RETURNED);
    expect(mapStatusByKeywords('')).toBe(ShipmentStatus.UNKNOWN);
    expect(mapStatusByKeywords(undefined)).toBe(ShipmentStatus.UNKNOWN);
  });
});

describe('overallStatus', () => {
  const ev = (...statuses: ShipmentStatus[]) => statuses.map((status) => ({ status }));
  it('toma el estado más avanzado aunque al final venga uno ambiguo', () => {
    expect(
      overallStatus(ev(ShipmentStatus.REGISTERED, ShipmentStatus.AT_DESTINATION, ShipmentStatus.UNKNOWN)),
    ).toBe(ShipmentStatus.AT_DESTINATION);
  });
  it('una devolución o incidencia al final manda', () => {
    expect(overallStatus(ev(ShipmentStatus.AT_DESTINATION, ShipmentStatus.RETURNED))).toBe(
      ShipmentStatus.RETURNED,
    );
    expect(overallStatus(ev(ShipmentStatus.IN_TRANSIT, ShipmentStatus.INCIDENT))).toBe(
      ShipmentStatus.INCIDENT,
    );
  });
  it('sin eventos conocidos es UNKNOWN', () => {
    expect(overallStatus([])).toBe(ShipmentStatus.UNKNOWN);
    expect(overallStatus(ev(ShipmentStatus.UNKNOWN))).toBe(ShipmentStatus.UNKNOWN);
  });
});

/** Forma real de getTrackingInformation (valores inventados): del más reciente al más antiguo. */
function olvaResponse(details: Array<[string, string, string]>, general: Record<string, unknown> = {}) {
  return {
    success: true,
    msg: 'resultados obtenidos',
    data: {
      general: {
        nombre_estado_tracking: details[0]?.[1],
        origen: 'LIMA',
        destino: 'HUARI (HRZ)',
        remitente: 'EMPRESA DE PRUEBA SAC',
        consignado: 'PERSONA DE PRUEBA',
        ...general,
      },
      details: details.map(([fecha_creacion, estado_tracking, nombre_sede]) => ({
        fecha_creacion,
        estado_tracking,
        nombre_sede,
        obs: 'ENTREGADO A PERSONA DE PRUEBA DNI 00000000',
        id_rpt_envio_ruta: '1',
      })),
      realtime: [],
    },
  };
}

describe('mapTracking (Olva)', () => {
  const delivered = olvaResponse([
    ['2026-09-23', 'ENTREGADO', 'HUARI (HRZ)'],
    ['2026-09-23', 'ASIGNADO', 'HUARI (HRZ)'],
    ['2026-09-21', 'CONFIRMACION EN TIENDA', 'HUARI (HRZ)'],
    ['2026-09-19', 'DESPACHADO', 'LIMA'],
    ['2026-09-18', 'EN VALIJA', 'LIMA'],
    ['2026-09-17', 'REGISTRADO', 'LIMA'],
  ]);

  it('ordena los pasos del más antiguo al más reciente y normaliza los estados', () => {
    const result = mapTracking('1234567', delivered);
    expect(result.events.map((e) => [e.at, e.status, e.rawStatus, e.location])).toEqual([
      ['2026-09-17', ShipmentStatus.REGISTERED, 'REGISTRADO', 'LIMA'],
      ['2026-09-18', ShipmentStatus.REGISTERED, 'EN VALIJA', 'LIMA'],
      ['2026-09-19', ShipmentStatus.IN_TRANSIT, 'DESPACHADO', 'LIMA'],
      ['2026-09-21', ShipmentStatus.AT_DESTINATION, 'CONFIRMACION EN TIENDA', 'HUARI'],
      ['2026-09-23', ShipmentStatus.UNKNOWN, 'ASIGNADO', 'HUARI'],
      ['2026-09-23', ShipmentStatus.DELIVERED, 'ENTREGADO', 'HUARI'],
    ]);
    expect(result).toMatchObject({
      carrier: 'olva',
      status: ShipmentStatus.DELIVERED,
      delivered: true,
      deliveredAt: '2026-09-23',
      destination: 'HUARI',
      transitTime: null,
    });
  });

  it('no copia textos libres ni datos de las personas fuera de raw', () => {
    const { raw: _raw, ...rest } = mapTracking('1234567', delivered);
    expect(JSON.stringify(rest)).not.toMatch(/PRUEBA|00000000/);
  });

  it('un "ASIGNADO" después de llegar a la tienda no lo hace retroceder', () => {
    const waiting = olvaResponse([
      ['2026-09-22', 'ASIGNADO', 'HUARI (HRZ)'],
      ['2026-09-21', 'CONFIRMACION EN TIENDA', 'HUARI (HRZ)'],
      ['2026-09-19', 'DESPACHADO', 'LIMA'],
    ]);
    expect(mapTracking('1234567', waiting)).toMatchObject({
      status: ShipmentStatus.AT_DESTINATION,
      delivered: false,
      deliveredAt: null,
    });
  });

  it('sin pasos usa el estado general', () => {
    const result = mapTracking('1234567', olvaResponse([], { nombre_estado_tracking: 'REGISTRADO' }));
    expect(result.events).toEqual([]);
    expect(result.status).toBe(ShipmentStatus.REGISTERED);
  });

  it('estados de Olva sin tildes ni espacios de más', () => {
    expect(mapOlvaStatus(' Confirmación  en tienda ')).toBe(ShipmentStatus.AT_DESTINATION);
    expect(mapOlvaStatus('MOTIVADO')).toBe(ShipmentStatus.INCIDENT);
  });
});

describe('mapShalomStatus', () => {
  /** rastrea/estados real (valores inventados). */
  const statuses = {
    registrado: { fecha: '2026-09-24 20:14:33' },
    origen: { fecha: '2026-09-24 20:14:33' },
    transito: { fecha: '2026-09-25 05:47:23', completo: true },
    destino: { fecha: '2026-09-25 06:38:09', completo: true },
    reparto: null,
    entregado: {
      fecha: '2026-09-26 16:26:16',
      cliente: { nombre: 'PERSONA DE PRUEBA', documento: '00000000', tipo_documento: 'DNI' },
    },
    demora: null,
  };

  it('con la búsqueda: entregado, fecha de entrega y pasos', () => {
    const result = mapShalomStatus('12345678', 'Entregado', statuses, { entregado: true, tiempo_llegada: '' });
    expect(result.events.map((e) => e.rawStatus)).toEqual(['registrado', 'origen', 'transito', 'destino', 'entregado']);
    expect(result).toMatchObject({
      status: ShipmentStatus.DELIVERED,
      delivered: true,
      deliveredAt: '2026-09-26 16:26:16',
      transitTime: null,
    });
    const { raw: _raw, ...rest } = result;
    expect(JSON.stringify(rest)).not.toMatch(/PRUEBA|00000000/);
  });

  it('si Shalom dice que no se entregó, el hito "entregado" no cuenta', () => {
    const result = mapShalomStatus('12345678', 'En destino', statuses, { entregado: false, tiempo_llegada: '24 horas' });
    expect(result.events.at(-1)?.rawStatus).toBe('destino');
    expect(result).toMatchObject({
      status: ShipmentStatus.AT_DESTINATION,
      delivered: false,
      deliveredAt: null,
      transitTime: '24 horas',
    });
  });

  it('por ose_id (sin búsqueda) basta la fecha de entrega', () => {
    expect(mapShalomStatus('1', 'Entregado', statuses).delivered).toBe(true);
    expect(mapShalomStatus('1', undefined, null)).toMatchObject({ delivered: false, events: [] });
  });
});
