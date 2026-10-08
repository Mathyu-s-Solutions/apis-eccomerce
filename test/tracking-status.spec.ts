import { describe, expect, it } from 'vitest';
import {
  mapStatusByKeywords,
  ShipmentStatus,
} from '../src/common/courier/tracking.model';
import { mapTracking } from '../src/modules/olva/olva.mapper';

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
    expect(mapStatusByKeywords('')).toBe(ShipmentStatus.UNKNOWN);
    expect(mapStatusByKeywords(undefined)).toBe(ShipmentStatus.UNKNOWN);
  });
});

describe('mapTracking (Olva)', () => {
  it('normaliza una respuesta con details y toma el último estado', () => {
    const raw = {
      details: [
        { estado: 'REGISTRADO', fecha: '2026-10-01 10:00' },
        { estado: 'EN TRANSITO', fecha: '2026-10-02 08:00' },
        { estado: 'ENTREGADO', fecha: '2026-10-03 15:00' },
      ],
    };
    const result = mapTracking('1234567890', raw);
    expect(result.carrier).toBe('olva');
    expect(result.events).toHaveLength(3);
    expect(result.status).toBe(ShipmentStatus.DELIVERED);
    expect(result.raw).toBe(raw);
  });

  it('no revienta con respuesta vacía', () => {
    const result = mapTracking('999', null);
    expect(result.status).toBe(ShipmentStatus.UNKNOWN);
    expect(result.events).toEqual([]);
  });
});
