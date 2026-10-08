'use client';

import { useEffect, useState } from 'react';
import { projectLatLng } from '@/lib/peru-map';

export type CourierId = 'shalom' | 'olva';

/** Agencia tal como la guarda scripts/snapshot-agencies.mjs, más su posición en el mapa. */
export interface MapAgency {
  id: string;
  n: string; // nombre
  d: string; // departamento (como lo devuelve la API)
  pv: string; // provincia
  a: string; // dirección
  h: string; // horario
  t: string; // teléfono (Shalom) o tipo de oficina (Olva)
  lat: number;
  lng: number;
  x: number; // % del ancho del mapa
  y: number; // % del alto del mapa
  key: string; // texto normalizado para buscar
}

export interface AgencySnapshot {
  updatedAt: string;
  total: number;
  agencies: MapAgency[];
}

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const cache = new Map<CourierId, Promise<AgencySnapshot>>();

export function loadAgencies(brand: CourierId): Promise<AgencySnapshot> {
  let p = cache.get(brand);
  if (!p) {
    p = fetch(`/data/agencies-${brand}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<AgencySnapshot>;
      })
      .then((snap) => ({
        ...snap,
        agencies: snap.agencies.map((a) => ({
          ...a,
          ...projectLatLng(a.lat, a.lng),
          key: normalize(`${a.n} ${a.pv} ${a.a} ${a.d}`),
        })),
      }));
    p.catch(() => cache.delete(brand));
    cache.set(brand, p);
  }
  return p;
}

export function useAgencies(brand: CourierId): { data: AgencySnapshot | null; failed: boolean } {
  const [state, setState] = useState<{ data: AgencySnapshot | null; failed: boolean }>({ data: null, failed: false });

  useEffect(() => {
    let alive = true;
    loadAgencies(brand).then(
      (data) => alive && setState({ data, failed: false }),
      () => alive && setState({ data: null, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [brand]);

  return state;
}
