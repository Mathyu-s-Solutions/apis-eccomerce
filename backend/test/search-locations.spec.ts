import { describe, expect, it } from 'vitest';
import type { Agency } from '../src/common/courier/courier-adapter.interface';
import { AgenciesSearchSchema, filterAgencies, haversineKm, searchAgencies } from '../src/common/courier/agency-search';
import { departmentId, PlaceTree, provinceId } from '../src/common/courier/locations';
import { TtlCache } from '../src/common/cache/ttl-cache';
import { costOf } from '../src/auth/cost.decorator';
import { apiKeyTracker } from '../src/auth/throttle';

const agency = (code: string, extra: Partial<Agency>): Agency => ({
  code,
  name: `Agencia ${code}`,
  department: 'LIMA',
  province: 'LIMA',
  district: 'MIRAFLORES',
  schedule: null,
  receivesShipments: true,
  ...extra,
});

// Plaza de Armas de Lima, Miraflores (~8 km), Arequipa (~765 km).
const list: Agency[] = [
  agency('arequipa', { department: 'AREQUIPA', province: 'AREQUIPA', district: 'CERCADO', latitude: -16.3988, longitude: -71.5369, airService: true }),
  agency('miraflores', { latitude: -12.1211, longitude: -77.0297, airService: true }),
  agency('centro', { district: 'CERCADO DE LIMA', latitude: -12.0464, longitude: -77.0428, airService: false }),
  agency('sin-coordenadas', { district: 'ATE' }),
  agency('solo-despacha', { latitude: -12.05, longitude: -77.04, receivesShipments: false }),
];

describe('búsqueda de agencias', () => {
  const search = (q: Record<string, string>) => searchAgencies(list, AgenciesSearchSchema.parse(q));

  it('con near ordena por distancia y respeta el radio', () => {
    const r = search({ near: '-12.0464,-77.0428', radiusKm: '20' });
    expect(r.map((a) => a.code)).toEqual(['centro', 'miraflores']);
    expect(r[0].distanceKm).toBe(0);
    expect(r[1].distanceKm).toBeGreaterThan(7);
    expect(r[1].distanceKm).toBeLessThan(10);
  });

  it('por defecto solo las que reciben envíos; aéreo y distrito filtran', () => {
    expect(search({}).map((a) => a.code)).not.toContain('solo-despacha');
    expect(search({ receivesShipments: '0' }).map((a) => a.code)).toContain('solo-despacha');
    expect(search({ air: '1' }).map((a) => a.code)).toEqual(['arequipa', 'miraflores']);
    expect(filterAgencies(list, { district: 'cercado de lima' }).map((a) => a.code)).toEqual(['centro']);
  });

  it('valida near y limita resultados', () => {
    expect(AgenciesSearchSchema.safeParse({ near: 'lima' }).success).toBe(false);
    expect(search({ limit: '2' })).toHaveLength(2);
    expect(Math.round(haversineKm({ lat: -12.0464, lng: -77.0428 }, { lat: -16.3988, lng: -71.5369 }))).toBeGreaterThan(740);
  });
});

describe('ubicaciones', () => {
  const tree = new PlaceTree([
    { ubigeo: '150101', department: 'LIMA', province: 'LIMA', district: 'LIMA' },
    { ubigeo: '150122', department: 'LIMA', province: 'LIMA', district: 'MIRAFLORES' },
    { ubigeo: '150501', department: 'LIMA', province: 'CAÑETE', district: 'SAN VICENTE DE CAÑETE' },
    { ubigeo: '010101', department: 'AMAZONAS', province: 'CHACHAPOYAS', district: 'CHACHAPOYAS' },
    { ubigeo: 'x', department: '', province: '', district: '' },
  ]);

  it('arma departamentos → provincias → distritos con ids del INEI', () => {
    expect(tree.departments()).toEqual([{ id: '01', name: 'AMAZONAS' }, { id: '15', name: 'LIMA' }]);
    expect(tree.provinces('15')).toEqual([{ id: '1505', name: 'CAÑETE' }, { id: '1501', name: 'LIMA' }]);
    expect(tree.districts('15', '01')?.map((d) => d.id)).toEqual(['150101', '150122']);
  });

  it('acepta ids cortos o completos; los que no existen = null', () => {
    expect(tree.provinces('1')).toEqual([{ id: '0101', name: 'CHACHAPOYAS' }]);
    expect(tree.districts('15', '1505')).toHaveLength(1);
    expect(tree.provinces('99')).toBeNull();
    expect(tree.districts('15', '0101')).toBeNull();
    expect(departmentId('abc')).toBeNull();
    expect(provinceId('15', '1')).toBe('1501');
  });
});

describe('caché', () => {
  it('una sola carga a la vez y no guarda lo que `keep` rechaza', async () => {
    const cache = new TtlCache<number[]>(60_000);
    let loads = 0;
    const load = async () => { loads++; return [1]; };
    await Promise.all([cache.get('a', load), cache.get('a', load)]);
    await cache.get('a', load);
    expect(loads).toBe(1);
    let empty = 0;
    await cache.get('b', async () => { empty++; return []; }, (v) => v.length > 0);
    await cache.get('b', async () => { empty++; return []; }, (v) => v.length > 0);
    expect(empty).toBe(2);
  });
});

describe('cobro y límite por minuto', () => {
  it('el costo puede depender de la request (una por guía)', () => {
    const perGuide = (req: { body?: unknown }) => ((req.body as { orders?: unknown[] })?.orders?.length ?? 1);
    expect(costOf(perGuide, { body: { orders: [1, 2, 3] } })).toBe(3);
    expect(costOf(perGuide, { body: {} })).toBe(1);
    expect(costOf(1, {})).toBe(1);
    expect(costOf(undefined, {})).toBe(0);
  });

  it('el límite va por key (hasheada) y, sin key, por IP', () => {
    const a = apiKeyTracker({ headers: { 'x-api-key': 'sk_live_a' }, ip: '1.1.1.1' });
    expect(a).toMatch(/^key:[0-9a-f]{32}$/);
    expect(a).not.toContain('sk_live_a');
    expect(apiKeyTracker({ headers: { 'x-api-key': 'sk_live_a' }, ip: '2.2.2.2' })).toBe(a);
    expect(apiKeyTracker({ headers: {}, ip: '1.1.1.1' })).toBe('ip:1.1.1.1');
  });
});
