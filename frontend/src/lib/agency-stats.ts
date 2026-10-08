import 'server-only';
import shalom from '../../public/data/agencies-shalom.json';
import olva from '../../public/data/agencies-olva.json';
import { DEPARTMENT_LABEL } from './peru-map';

const SNAPSHOTS = { shalom, olva };

export interface AgencyStats {
  /** Agencias en el catálogo de la API. */
  total: number;
  departments: number;
  /** [departamento, agencias] de mayor a menor. */
  byDepartment: [string, number][];
}

/** Cifras para la landing, calculadas del mismo snapshot que usa el mapa. */
export function agencyStats(brand: keyof typeof SNAPSHOTS): AgencyStats {
  const snap = SNAPSHOTS[brand];
  const counts = new Map<string, number>();
  for (const a of snap.agencies) counts.set(a.d, (counts.get(a.d) ?? 0) + 1);
  return {
    total: snap.total,
    departments: counts.size,
    byDepartment: [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([d, n]) => [DEPARTMENT_LABEL[d] ?? d, n]),
  };
}
