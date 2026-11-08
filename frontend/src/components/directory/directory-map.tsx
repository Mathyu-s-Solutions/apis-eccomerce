import { DEPARTMENTS, PERU_MAP, projectLatLng } from '@/lib/peru-map';

interface MapPoint {
  lat: number;
  lng: number;
  /** Punto principal (la agencia de la página): más grande y con el color de la marca. */
  strong?: boolean;
}

/** Puntos [x, y] del path SVG de un departamento. */
function pathPoints(d: string): [number, number][] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

/**
 * Mapa estático del Perú (SVG, sin JS) con las agencias como puntos. Con `focus`, se acerca
 * al departamento resaltado. Usa los mismos contornos que el mapa interactivo de la landing.
 */
export function DirectoryMap({ points, highlight, focus, label }: { points: MapPoint[]; highlight?: string; focus?: boolean; label: string }) {
  const pts = points.map((p) => {
    const { x, y } = projectLatLng(p.lat, p.lng);
    return { x: (x / 100) * PERU_MAP.width, y: (y / 100) * PERU_MAP.height, strong: p.strong };
  });

  let box: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: PERU_MAP.width, h: PERU_MAP.height };
  if (focus) {
    const dep = DEPARTMENTS.find((d) => d.id === highlight);
    const all = [...(dep?.d ? pathPoints(dep.d) : []), ...pts.map((p): [number, number] => [p.x, p.y])];
    if (all.length) {
      const xs = all.map((p) => p[0]);
      const ys = all.map((p) => p[1]);
      const pad = 18;
      const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 90) + pad * 2;
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      box = { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
    }
  }
  const r = box.w / 110;

  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label={label} className="h-auto w-full">
      {/* El resaltado va al final: si no, los vecinos tapan parte de su borde. */}
      {DEPARTMENTS.filter((d) => d.d)
        .sort((a, b) => Number(a.id === highlight) - Number(b.id === highlight))
        .map((d) => (
        <path
          key={d.id}
          d={d.d}
          vectorEffect="non-scaling-stroke"
          strokeWidth={1.2}
          className={d.id === highlight ? 'fill-[var(--tint)] stroke-[var(--accent)]' : 'fill-[#E8EBF1] stroke-white'}
        />
      ))}
      {pts
        .filter((p) => !p.strong)
        .map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={r} className="fill-[var(--accent)]" opacity={0.75} />
        ))}
      {pts
        .filter((p) => p.strong)
        .map((p, i) => (
          <circle key={`s${i}`} cx={p.x} cy={p.y} r={r * 2} vectorEffect="non-scaling-stroke" strokeWidth={2.5} className="fill-[var(--signature)] stroke-white" />
        ))}
    </svg>
  );
}
