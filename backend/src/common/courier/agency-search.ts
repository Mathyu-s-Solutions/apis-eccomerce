import { z } from 'zod';
import type { Agency } from './courier-adapter.interface';
import { RawQuerySchema } from './raw-query';

const norm = (s: string | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const flag = z
  .enum(['1', '0', 'true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === '1' || v === 'true'));

/** Filtros de GET /agencies: texto libre y ubicación (por nombre, sin tildes). */
export const AgenciesQuerySchema = RawQuerySchema.extend({
  q: z.string().trim().optional(),
  department: z.string().trim().optional(),
  province: z.string().trim().optional(),
  district: z.string().trim().optional(),
});
export type AgenciesQueryDto = z.infer<typeof AgenciesQuerySchema>;

/** GET /agencies/search: los mismos filtros, más servicio aéreo y cercanía a un punto. */
export const AgenciesSearchSchema = AgenciesQuerySchema.extend({
  /** Solo Shalom informa qué agencias tienen servicio aéreo. */
  air: flag,
  /** Solo agencias que reciben envíos (por defecto, sí). */
  receivesShipments: flag,
  near: z
    .string()
    .trim()
    .regex(/^-?\d{1,2}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/, 'near debe ser "lat,lng", p. ej. -12.0464,-77.0428')
    .transform((v) => {
      const [lat, lng] = v.split(',').map(Number);
      return { lat, lng };
    })
    .optional(),
  radiusKm: z.coerce.number().positive().max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});
export type AgenciesSearchDto = z.infer<typeof AgenciesSearchSchema>;

export type AgencyMatch = Agency & { distanceKm?: number };

export function filterAgencies(
  list: Agency[],
  f: { q?: string; department?: string; province?: string; district?: string },
): Agency[] {
  let result = list;
  if (f.department) {
    const d = norm(f.department);
    result = result.filter((a) => norm(a.department).includes(d));
  }
  if (f.province) {
    const p = norm(f.province);
    result = result.filter((a) => norm(a.province).includes(p));
  }
  if (f.district) {
    const d = norm(f.district);
    result = result.filter((a) => norm(a.district).includes(d));
  }
  if (f.q) {
    const q = norm(f.q);
    result = result.filter((a) =>
      norm(`${a.name} ${a.address} ${a.district} ${a.province} ${a.department}`).includes(q),
    );
  }
  return result;
}

/** Distancia en km entre dos coordenadas (haversine). */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Búsqueda: filtra, y con `near` ordena por distancia (las agencias sin
 * coordenadas quedan fuera). Por defecto solo las que reciben envíos.
 */
export function searchAgencies(list: Agency[], s: AgenciesSearchDto): AgencyMatch[] {
  let result: AgencyMatch[] = filterAgencies(list, s);
  if (s.receivesShipments !== false) result = result.filter((a) => a.receivesShipments);
  if (s.air !== undefined) result = result.filter((a) => (a.airService ?? false) === s.air);
  if (s.near) {
    const near = s.near;
    result = result
      .filter((a) => a.latitude !== undefined && a.longitude !== undefined)
      .map((a) => ({ ...a, distanceKm: Math.round(haversineKm(near, { lat: a.latitude!, lng: a.longitude! }) * 100) / 100 }))
      .filter((a) => s.radiusKm === undefined || a.distanceKm! <= s.radiusKm)
      .sort((x, y) => x.distanceKm! - y.distanceKm!);
  }
  return result.slice(0, s.limit);
}
