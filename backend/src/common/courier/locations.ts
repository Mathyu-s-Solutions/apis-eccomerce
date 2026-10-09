import { NotFoundException } from '@nestjs/common';
import type { Place } from './courier-adapter.interface';

/** "1" o "01" → "01" (departamento). `null` si no es un código válido. */
export function departmentId(value: string): string | null {
  return /^\d{1,2}$/.test(value) ? value.padStart(2, '0') : null;
}

/**
 * Provincia de un departamento: "1", "01" o "0101" → "0101". `null` si no es
 * un código válido o es de otro departamento.
 */
export function provinceId(department: string, value: string): string | null {
  if (/^\d{1,2}$/.test(value)) return `${department}${value.padStart(2, '0')}`;
  if (/^\d{4}$/.test(value) && value.startsWith(department)) return value;
  return null;
}

const byName = (a: Place, b: Place) => a.name.localeCompare(b.name, 'es');

/** Árbol de ubicaciones a partir de una lista plana de ubigeos de 6 dígitos. */
export class PlaceTree {
  private readonly departmentList: Place[];
  private readonly provinceMap = new Map<string, Place[]>();
  private readonly districtMap = new Map<string, Place[]>();

  constructor(rows: Array<{ ubigeo: string; department: string; province: string; district: string }>) {
    const deps = new Map<string, string>();
    const provs = new Map<string, Map<string, string>>();
    for (const r of rows) {
      if (!/^\d{6}$/.test(r.ubigeo)) continue;
      const dep = r.ubigeo.slice(0, 2);
      const prov = r.ubigeo.slice(0, 4);
      deps.set(dep, r.department.trim());
      if (!provs.has(dep)) provs.set(dep, new Map());
      provs.get(dep)!.set(prov, r.province.trim());
      const list = this.districtMap.get(prov) ?? [];
      list.push({ id: r.ubigeo, name: r.district.trim() });
      this.districtMap.set(prov, list);
    }
    this.departmentList = [...deps].map(([id, name]) => ({ id, name })).sort(byName);
    for (const [dep, map] of provs) this.provinceMap.set(dep, [...map].map(([id, name]) => ({ id, name })).sort(byName));
    for (const list of this.districtMap.values()) list.sort(byName);
  }

  departments(): Place[] {
    return this.departmentList;
  }

  provinces(department: string): Place[] | null {
    const dep = departmentId(department);
    return (dep && this.provinceMap.get(dep)) || null;
  }

  districts(department: string, province: string): Place[] | null {
    const dep = departmentId(department);
    const prov = dep && provinceId(dep, province);
    return (prov && this.districtMap.get(prov)) || null;
  }
}

/** Para los controllers: `null` (no existe) → 404. */
export function orNotFound<T>(value: T | null, message: string): T {
  if (value === null) throw new NotFoundException(message);
  return value;
}
