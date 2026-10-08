'use client';

import { useCallback, useMemo, useState } from 'react';
import { Building2, Clock, MapPin, Navigation, Phone, Search, X } from 'lucide-react';
import { DEPARTMENTS, DEPARTMENT_LABEL, PERU_MAP } from '@/lib/peru-map';
import { cn } from '@/lib/utils';
import { normalize, useAgencies, type CourierId, type MapAgency } from './agencies';

const LIST_LIMIT = 80;

const TONES = {
  light: {
    panel: 'bg-white border-[#E6E8EF] text-[var(--foreground)]',
    divider: 'border-[#EEF0F5]',
    label: 'text-[#6B7290]',
    field: 'border-[#D9DDE8] bg-white text-[var(--foreground)]',
    count: 'text-[var(--foreground)]',
    row: 'border-[#EEF0F5] hover:bg-[#F4F6FB]',
    rowOn: 'bg-[var(--tint)] hover:bg-[var(--tint)]',
    rowMeta: 'text-[#6B7290]',
    rowAddr: 'text-[var(--muted)]',
    pin: 'text-[var(--signature)]',
    dep: 'fill-[#E9EEF8] stroke-white hover:fill-[var(--tint)]',
    depOn: 'fill-[var(--tint)] stroke-[var(--dark)]',
    dot: 'bg-[var(--signature)] border-white hover:bg-[var(--dark)]',
    dotOn: 'bg-[var(--dark)] border-white shadow-[0_0_0_5px_rgba(34,47,92,.22)]',
    badge: 'bg-white/90 border-[#E6E8EF]',
    detail: 'bg-[var(--dark)] text-white',
    detailMeta: 'text-[var(--on-dark-muted)]',
    close: 'bg-white/10 text-white',
    code: 'bg-[var(--darker)] text-[#DDE2F2]',
    verb: 'bg-[var(--signature)] text-[var(--on-signature)]',
  },
  dark: {
    panel: 'bg-[#0F172A] border-[#1E293B] text-[#F1F5F9]',
    divider: 'border-[#1E293B]',
    label: 'text-[#94A3B8]',
    field: 'border-[#334155] bg-[#020617] text-[#F1F5F9]',
    count: 'text-[var(--signature)]',
    row: 'border-[#1E293B] hover:bg-[#1E293B]',
    rowOn: 'bg-[#2546BB] hover:bg-[#2546BB]',
    rowMeta: 'text-[#94A3B8]',
    rowAddr: 'text-[#CBD5E1]',
    pin: 'text-[var(--signature)]',
    dep: 'fill-[#1E293B] stroke-[#334155] hover:fill-[#26375C]',
    depOn: 'fill-[#2546BB] stroke-[var(--signature)]',
    dot: 'bg-[var(--signature)] border-[#020617] hover:bg-white',
    dotOn: 'bg-white border-[#020617] shadow-[0_0_0_5px_rgba(249,181,47,.35)]',
    badge: 'bg-[#020617]/90 border-[#1E293B]',
    detail: 'bg-[var(--signature)] text-[var(--on-signature)]',
    detailMeta: 'opacity-75',
    close: 'bg-black/10 text-[var(--on-signature)]',
    code: 'bg-[#0F172A] border border-[#1E293B] text-[#E2E8F0]',
    verb: 'bg-[var(--signature)] text-[var(--on-signature)]',
  },
};

interface Props {
  brand: CourierId;
  tone: 'light' | 'dark';
  /** "agencia" u "oficina". */
  noun: string;
  apiPrefix: string;
}

export function AgencyMap({ brand, tone, noun, apiPrefix }: Props) {
  const t = TONES[tone];
  const { data, failed } = useAgencies(brand);
  const [query, setQuery] = useState('');
  const [dep, setDep] = useState('');
  const [selId, setSelId] = useState<string | null>(null);

  const agencies = useMemo(() => data?.agencies ?? [], [data]);
  const q = normalize(query.trim());
  const filtering = Boolean(dep || q);

  const filtered = useMemo(
    () => agencies.filter((a) => (!dep || a.d === dep) && (!q || a.key.includes(q))),
    [agencies, dep, q],
  );
  const inFilter = useMemo(() => new Set(filtered.map((a) => a.id)), [filtered]);
  const sel = selId ? agencies.find((a) => a.id === selId) ?? null : null;

  const view = useMemo(() => zoomTo(sel ? [sel] : filtering ? filtered : [], Boolean(sel)), [sel, filtering, filtered]);

  const pickDep = useCallback((name: string) => {
    setDep(name);
    setSelId(null);
  }, []);

  const reset = () => {
    setDep('');
    setQuery('');
    setSelId(null);
  };

  const count = filtered.length;
  const where = dep ? ` en ${DEPARTMENT_LABEL[dep]}` : ' en todo el Perú';
  const countLabel = data
    ? `${count} ${count === 1 ? noun : `${noun}s`}${q ? ` para “${query.trim()}”` : ''}${where}`
    : failed
      ? `No pudimos cargar las ${noun}s`
      : 'Cargando…';
  const qs = [dep && `department=${encodeURIComponent(dep)}`, query.trim() && `q=${encodeURIComponent(query.trim())}`]
    .filter(Boolean)
    .join('&');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-hover)]"
        >
          <Navigation size={17} /> Ver todo el Perú
        </button>
      </div>

      <div className="flex flex-wrap items-stretch gap-5">
        {/* Filtros y lista */}
        <div className={cn('flex h-[640px] min-w-0 max-w-full flex-[1_1_340px] flex-col overflow-hidden rounded-[18px] border md:h-[760px]', t.panel)}>
          <div className={cn('flex flex-col gap-3 border-b p-5', t.divider)}>
            <label htmlFor={`${brand}-q`} className={cn('text-[13px] font-semibold', t.label)}>
              Buscar {noun}
            </label>
            <div className={cn('flex items-center gap-2.5 rounded-[10px] border-[1.5px] px-3', t.field)}>
              <Search size={18} className={t.label} />
              <input
                id={`${brand}-q`}
                type="search"
                placeholder="Distrito, dirección o nombre"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelId(null);
                }}
                className="min-w-0 flex-1 bg-transparent py-3 text-[15px] outline-none"
              />
            </div>
            <label htmlFor={`${brand}-dep`} className={cn('text-[13px] font-semibold', t.label)}>
              Departamento
            </label>
            <select
              id={`${brand}-dep`}
              value={dep}
              onChange={(e) => pickDep(e.target.value)}
              className={cn('rounded-[10px] border-[1.5px] p-3 text-[15px]', t.field)}
            >
              <option value="">Todo el Perú</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            <p aria-live="polite" className={cn('text-sm font-semibold', t.count)}>
              {countLabel}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.slice(0, LIST_LIMIT).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelId(a.id)}
                aria-pressed={a.id === selId}
                className={cn('flex w-full gap-3 border-b px-3.5 py-3 text-left transition-colors', t.row, a.id === selId && t.rowOn)}
              >
                <MapPin size={20} className={cn('mt-0.5 shrink-0', t.pin)} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{a.n}</span>
                  <span className={cn('text-[13px]', t.rowMeta)}>
                    {DEPARTMENT_LABEL[a.d] ?? a.d} · {a.pv}
                  </span>
                  <span className={cn('text-[13px] leading-snug', t.rowAddr)}>{a.a}</span>
                </span>
              </button>
            ))}
            {count > LIST_LIMIT && (
              <p className={cn('px-5 py-4 text-[13px]', t.label)}>
                Mostrando {LIST_LIMIT} de {count}. Filtra por departamento o busca para ver el resto.
              </p>
            )}
          </div>
        </div>

        {/* Mapa */}
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5">
          <div className={cn('relative h-[560px] overflow-hidden rounded-[18px] border md:h-[690px]', t.panel)}>
            <div className="absolute inset-5 flex justify-center">
              <div className="relative h-full max-w-full overflow-hidden rounded-[10px]" style={{ aspectRatio: `${PERU_MAP.width} / ${PERU_MAP.height}` }}>
                <div className="map-zoom" style={{ transform: `translate(${view.tx}%, ${view.ty}%) scale(${view.z})` }}>
                  <svg viewBox={`0 0 ${PERU_MAP.width} ${PERU_MAP.height}`} className="block h-full w-full" aria-label="Mapa del Perú por departamentos">
                    {DEPARTMENTS.filter((d) => d.d).map((d) => (
                      <path
                        key={d.id}
                        d={d.d}
                        strokeWidth={1.2}
                        className={cn('map-dep', dep === d.id ? t.depOn : t.dep)}
                        onClick={() => pickDep(dep === d.id ? '' : d.id)}
                      >
                        <title>{d.label}</title>
                      </path>
                    ))}
                  </svg>
                  {agencies.map((a) => (
                    <Dot
                      key={a.id}
                      a={a}
                      inv={1 / view.z}
                      dim={filtering && !inFilter.has(a.id)}
                      on={a.id === selId}
                      className={a.id === selId ? t.dotOn : t.dot}
                      onPick={setSelId}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className={cn('absolute left-4 top-4 flex flex-col gap-0.5 rounded-xl border px-3.5 py-2.5', t.badge)}>
              <span className={cn('text-xs', t.label)}>Vista actual</span>
              <span className="text-[17px] font-bold">{sel ? sel.n : dep ? DEPARTMENT_LABEL[dep] : 'Todo el Perú'}</span>
            </div>

            {sel && (
              <div className={cn('absolute inset-x-4 bottom-4 ml-auto flex max-w-[400px] flex-col gap-3 rounded-2xl p-5 shadow-2xl', t.detail)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className={cn('text-xs', t.detailMeta)}>
                      {DEPARTMENT_LABEL[sel.d] ?? sel.d} · {sel.pv}
                    </span>
                    <span className="text-xl font-bold leading-tight">{sel.n}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelId(null)}
                    aria-label="Cerrar detalle"
                    className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px]', t.close)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <Info icon={<MapPin size={18} />}>{sel.a}</Info>
                <Info icon={<Clock size={18} />}>{sel.h || 'Horario no informado'}</Info>
                <Info icon={brand === 'shalom' ? <Phone size={18} /> : <Building2 size={18} />}>
                  {sel.t || (brand === 'shalom' ? 'Teléfono no informado' : 'Oficina')}
                </Info>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${sel.lat},${sel.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-hover)]"
                >
                  <Navigation size={18} /> Cómo llegar
                </a>
              </div>
            )}
          </div>

          <div className={cn('flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-xl px-4 py-3.5 font-mono text-sm', t.code)}>
            <span className={cn('rounded-md px-2 py-0.5 font-medium', t.verb)}>GET</span>
            <span className="break-all">
              {apiPrefix}/agencies{qs && `?${qs}`}
            </span>
            <span className="ml-auto opacity-70">gratis · no consume cuota</span>
          </div>
          {data && (
            <p className={cn('text-xs', tone === 'dark' ? 'text-[#94A3B8]' : 'text-[var(--muted)]')}>
              {data.agencies.length} de {data.total} {noun}s tienen coordenadas · datos al {data.updatedAt}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 text-sm leading-snug">
      <span className="shrink-0 opacity-90">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function Dot({
  a,
  inv,
  dim,
  on,
  className,
  onPick,
}: {
  a: MapAgency;
  inv: number;
  dim: boolean;
  on: boolean;
  className: string;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={a.n}
      onClick={() => onPick(a.id)}
      className={cn('map-dot', className, dim && 'opacity-[.18]', on && 'z-10')}
      style={{
        left: `${a.x}%`,
        top: `${a.y}%`,
        transform: `translate(-50%, -50%) scale(${inv})`,
        ...(on && { width: 14, height: 14 }),
      }}
    />
  );
}

/** Encaja un grupo de agencias en el mapa: escala y traslación en % del lienzo. */
function zoomTo(focus: MapAgency[], single: boolean): { z: number; tx: number; ty: number } {
  if (!focus.length) return { z: 1, tx: 0, ty: 0 };
  let x0 = 100, x1 = 0, y0 = 100, y1 = 0;
  for (const a of focus) {
    x0 = Math.min(x0, a.x);
    x1 = Math.max(x1, a.x);
    y0 = Math.min(y0, a.y);
    y1 = Math.max(y1, a.y);
  }
  const bw = Math.max(x1 - x0, 8) + 12;
  const bh = Math.max(y1 - y0, 6) + 10;
  const z = Math.max(1, Math.min(single ? 5.5 : 4.5, 100 / bw, 100 / bh));
  const clamp = (v: number) => Math.min(0, Math.max(100 - 100 * z, v));
  return { z, tx: clamp(50 - (z * (x0 + x1)) / 2), ty: clamp(50 - (z * (y0 + y1)) / 2) };
}
