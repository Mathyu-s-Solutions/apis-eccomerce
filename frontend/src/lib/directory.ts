import 'server-only';
import shalomSnapshot from '../../public/data/agencies-shalom.json';
import olvaSnapshot from '../../public/data/agencies-olva.json';
import { DEPARTMENT_LABEL } from './peru-map';

/**
 * Directorio público de agencias (páginas /agencias y /agencia/<slug>), armado del mismo
 * snapshot que usa el mapa de la landing (scripts/snapshot-agencies.mjs). Cada vez que se
 * regenera el snapshot, el directorio y el sitemap se actualizan solos.
 */

export type CourierId = 'shalom' | 'olva';
export const COURIERS: CourierId[] = ['shalom', 'olva'];

/** Nombre con el que la gente busca cada courier. */
export const COURIER_NAME: Record<CourierId, string> = { shalom: 'Shalom', olva: 'Olva Courier' };

interface SnapshotAgency {
  id: string;
  n: string;
  d: string;
  pv: string;
  /** Distrito: solo en los snapshots nuevos. */
  ds?: string;
  a: string;
  h: string;
  t: string;
  lat: number;
  lng: number;
}

interface Snapshot {
  updatedAt: string;
  total: number;
  agencies: SnapshotAgency[];
}

const SNAPSHOTS: Record<CourierId, Snapshot> = { shalom: shalomSnapshot, olva: olvaSnapshot };

export interface Agency {
  id: string;
  /** Segmento de la URL: nombre + id, para que sea único y estable. */
  slug: string;
  name: string;
  departmentId: string;
  department: string;
  departmentSlug: string;
  province: string;
  provinceSlug: string;
  district: string;
  address: string;
  reference: string;
  /** Tramos del horario ("Lun–sáb 08:00–20:00", "Dom 08:00–17:00"). */
  hours: string[];
  opensSunday: boolean;
  phone: string;
  lat: number;
  lng: number;
}

export interface Province {
  slug: string;
  name: string;
  agencies: Agency[];
  /** Solo las provincias con varias agencias tienen página propia; si no, se enlaza la agencia. */
  hasPage: boolean;
}

export interface Department {
  id: string;
  slug: string;
  name: string;
  agencies: Agency[];
  provinces: Province[];
}

export interface Directory {
  courier: CourierId;
  updatedAt: string;
  agencies: Agency[];
  departments: Department[];
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "Jr. Grau 270, Ref. Junto a la agencia" → dirección y referencia por separado. */
function splitReference(raw: string): { address: string; reference: string } {
  const m = /\s*[,(-]?\s*\(?\b(?:referencia|ref)\b\.?\s*:?\s*/i.exec(raw);
  if (!m || m.index < 6) return { address: raw.trim(), reference: '' };
  return {
    address: raw.slice(0, m.index).replace(/[\s,.-]+$/, ''),
    reference: raw.slice(m.index + m[0].length).replace(/\)\s*$/, '').trim(),
  };
}

/** "015007878" → "(01) 500 7878"; el resto queda como viene. */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (/^01\d{7}$/.test(digits)) return `(01) ${digits.slice(2, 5)} ${digits.slice(5)}`;
  return raw.trim();
}

function toAgency(courier: CourierId, a: SnapshotAgency): Agency {
  const department = DEPARTMENT_LABEL[a.d] ?? a.d;
  const hours = a.h
    ? a.h.split(' · ').map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    : [];
  return {
    id: a.id,
    slug: `${slugify(a.n) || 'agencia'}-${a.id}`,
    name: a.n,
    departmentId: a.d,
    department,
    departmentSlug: slugify(department),
    province: a.pv,
    provinceSlug: slugify(a.pv),
    district: a.ds ?? '',
    ...splitReference(a.a),
    hours,
    opensSunday: /dom \d/i.test(a.h),
    // En Olva `t` es el tipo de oficina (siempre "Tiendas"): no aporta.
    phone: courier === 'shalom' ? formatPhone(a.t) : '',
    lat: a.lat,
    lng: a.lng,
  };
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es');

function build(courier: CourierId): Directory {
  const snap = SNAPSHOTS[courier];
  const agencies = snap.agencies.map((a) => toAgency(courier, a)).sort(byName);

  const deps = new Map<string, Agency[]>();
  for (const a of agencies) deps.set(a.departmentId, [...(deps.get(a.departmentId) ?? []), a]);

  const departments = [...deps].map(([id, list]): Department => {
    const provs = new Map<string, Agency[]>();
    for (const a of list) provs.set(a.provinceSlug, [...(provs.get(a.provinceSlug) ?? []), a]);
    const multiProvince = provs.size > 1;
    const provinces = [...provs]
      .map(([slug, items]): Province => ({ slug, name: items[0].province, agencies: items, hasPage: multiProvince && items.length >= 2 }))
      // Primero las ciudades con más agencias (la capital suele ir arriba).
      .sort((a, b) => b.agencies.length - a.agencies.length || byName(a, b));
    return { id, slug: list[0].departmentSlug, name: list[0].department, agencies: list, provinces };
  });

  return { courier, updatedAt: snap.updatedAt, agencies, departments: departments.sort(byName) };
}

const cache = new Map<CourierId, Directory>();

export function getDirectory(courier: CourierId): Directory {
  let dir = cache.get(courier);
  if (!dir) {
    dir = build(courier);
    cache.set(courier, dir);
  }
  return dir;
}

export function findDepartment(dir: Directory, slug: string): Department | undefined {
  return dir.departments.find((d) => d.slug === slug);
}

export function findAgency(dir: Directory, slug: string): Agency | undefined {
  // El id manda: si el nombre cambió, el slug viejo igual encuentra la agencia (y se redirige).
  const id = /-([^-]+)$/.exec(slug)?.[1];
  return dir.agencies.find((a) => a.slug === slug) ?? (id ? dir.agencies.find((a) => a.id === id) : undefined);
}

/** Distancia en km entre dos puntos (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function nearestAgencies(dir: Directory, from: Agency, count = 6): { agency: Agency; km: number }[] {
  return dir.agencies
    .filter((a) => a.id !== from.id)
    .map((agency) => ({ agency, km: distanceKm(from, agency) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** URLs del directorio (relativas al dominio de la marca). */
export const directoryPath = {
  index: () => '/agencias',
  department: (d: { slug: string }) => `/agencias/${d.slug}`,
  province: (d: { slug: string }, p: { slug: string }) => `/agencias/${d.slug}/${p.slug}`,
  agency: (a: { slug: string }) => `/agencia/${a.slug}`,
};

export function mapsDirections(a: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`;
}

/** "2026-10-08" → "8 de octubre de 2026" */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
}

/** Todas las URLs del directorio, para el sitemap. */
export function directoryUrls(courier: CourierId): string[] {
  const dir = getDirectory(courier);
  return [
    directoryPath.index(),
    ...dir.departments.flatMap((d) => [
      directoryPath.department(d),
      ...d.provinces.filter((p) => p.hasPage).map((p) => directoryPath.province(d, p)),
    ]),
    ...dir.agencies.map(directoryPath.agency),
  ];
}
