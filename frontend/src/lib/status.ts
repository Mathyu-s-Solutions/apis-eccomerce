import 'server-only';
import { unstable_cache } from 'next/cache';
import { prisma } from './db';
import { BRANDS, type BrandId, type SiteId } from './brands';

/**
 * Página de estado (/status). El worker del backend prueba la API y cada servicio del que
 * depende cada 10 minutos y guarda el resultado en `status_checks`
 * (backend/src/modules/status). Aquí se lee esa tabla directo de Neon —así la página
 * funciona aunque la API esté caída— y se le pregunta a la API si responde ahora.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.mathyu.dev';

/** Cada cuánto corre el worker (Cloud Scheduler). */
const INTERVAL_MS = 10 * 60_000;
/** Sin chequeos más nuevos que esto, el estado actual es desconocido. */
const STALE_MS = 30 * 60_000;
/** Entre dos chequeos de la API, un hueco mayor que esto es que no respondió. */
const GAP_MS = 25 * 60_000;
/** Un día con caídas que suman esto o más va en rojo. */
export const MAJOR_DOWN_MINUTES = 30;
export const HISTORY_DAYS = 90;
export const INCIDENT_DAYS = 14;

export type CheckStatus = 'up' | 'degraded' | 'down';
export type Level = CheckStatus | 'unknown';
export type DayLevel = 'up' | 'minor' | 'major' | 'none';
export type GroupId = 'platform' | BrandId;

export interface StatusComponent {
  /** Igual que en backend/src/modules/status/status.service.ts. */
  id: string;
  group: GroupId;
  name: string;
  description: string;
}

export const COMPONENTS: StatusComponent[] = [
  { id: 'api', group: 'platform', name: 'API REST y webhooks', description: 'Recibe tus consultas, valida la key y la cuota, y manda los webhooks.' },
  { id: 'shalom-web', group: 'shalom', name: 'Rastreo, agencias y cotización', description: 'Conexión con la web de Shalom (shalom.com.pe).' },
  { id: 'shalom-pro', group: 'shalom', name: 'Creación de guías', description: 'Conexión con Shalom Pro (pro.shalom.pe).' },
  { id: 'olva-tracking', group: 'olva', name: 'Rastreo', description: 'Conexión con el rastreo de Olva.' },
  { id: 'olva-web', group: 'olva', name: 'Agencias y cotización', description: 'Conexión con olvacourier.com.' },
  { id: 'sunat-cpe', group: 'sunat', name: 'Facturas, boletas y notas', description: 'Servicio de comprobantes electrónicos de SUNAT (producción).' },
  { id: 'sunat-beta', group: 'sunat', name: 'Entorno de pruebas (beta)', description: 'Servicio de comprobantes de SUNAT beta, sin validez tributaria.' },
  { id: 'sunat-api', group: 'sunat', name: 'Guías de remisión, validez y SIRE', description: 'APIs REST de SUNAT.' },
  { id: 'sunat-padron', group: 'sunat', name: 'Consulta RUC y DNI', description: 'Padrón reducido que publica SUNAT cada día.' },
  { id: 'sunat-exchange', group: 'sunat', name: 'Tipo de cambio', description: 'Cotización SBS desde la API del BCRP.' },
];

export function groupName(group: GroupId): string {
  return group === 'platform' ? "Mathyu's APIs" : BRANDS[group].name;
}

/** Grupos que muestra cada sitio: la central, todos; el de una API, la plataforma y lo suyo. */
export function groupsFor(site: SiteId): GroupId[] {
  return site === 'hub' ? ['platform', 'shalom', 'olva', 'sunat'] : ['platform', site];
}

// ---------- Lectura ----------

interface DayRow { component: string; day: string; total: number; up: number; degraded: number; down: number }
interface LatestRow { component: string; checkedAt: string; status: CheckStatus; latencyMs: number | null; detail: string | null }
interface DownRow { component: string; checkedAt: string; detail: string | null }

export interface StatusChecks {
  days: DayRow[];
  latest: LatestRow[];
  downs: DownRow[];
  /** Huecos entre dos chequeos seguidos de la API (la API o el worker no respondieron). */
  apiGaps: { from: string; to: string }[];
  loadedAt: string;
}

export interface ApiHealth {
  ok: boolean;
  latencyMs: number | null;
  detail: string | null;
  checkedAt: string;
}

const iso = (d: Date | string) => new Date(d).toISOString();

async function loadChecks(): Promise<StatusChecks> {
  // checked_at es un timestamp sin zona en UTC (Prisma): se compara contra now() en UTC y
  // el día se arma en hora de Lima.
  const [days, latest, downs, apiGaps] = await Promise.all([
    prisma.$queryRaw<DayRow[]>`
      SELECT component,
             to_char((checked_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS day,
             count(*)::int AS total,
             count(*) FILTER (WHERE status = 'up')::int AS up,
             count(*) FILTER (WHERE status = 'degraded')::int AS degraded,
             count(*) FILTER (WHERE status = 'down')::int AS down
      FROM status_checks
      WHERE checked_at >= (now() AT TIME ZONE 'UTC') - interval '91 days'
      GROUP BY 1, 2`,
    prisma.$queryRaw<(Omit<LatestRow, 'checkedAt'> & { checkedAt: Date })[]>`
      SELECT DISTINCT ON (component) component, checked_at AS "checkedAt", status, latency_ms AS "latencyMs", detail
      FROM status_checks
      WHERE checked_at >= (now() AT TIME ZONE 'UTC') - interval '3 days'
      ORDER BY component, checked_at DESC`,
    prisma.statusCheck.findMany({
      where: { status: 'down', checkedAt: { gte: new Date(Date.now() - INCIDENT_DAYS * 86_400_000) } },
      orderBy: [{ component: 'asc' }, { checkedAt: 'asc' }],
      select: { component: true, checkedAt: true, detail: true },
    }),
    prisma.$queryRaw<{ from: Date; to: Date }[]>`
      SELECT prev AS "from", checked_at AS "to"
      FROM (
        SELECT checked_at, lag(checked_at) OVER (ORDER BY checked_at) AS prev
        FROM status_checks
        WHERE component = 'api' AND checked_at >= (now() AT TIME ZONE 'UTC') - interval '91 days'
      ) t
      WHERE prev IS NOT NULL AND checked_at - prev > interval '25 minutes'`,
  ]);
  return {
    days,
    latest: latest.map((r) => ({ ...r, checkedAt: iso(r.checkedAt) })),
    downs: downs.map((r) => ({ ...r, checkedAt: iso(r.checkedAt) })),
    apiGaps: apiGaps.map((g) => ({ from: iso(g.from), to: iso(g.to) })),
    loadedAt: new Date().toISOString(),
  };
}

/** ¿Responde la API ahora? Un reintento antes de darla por caída. Nunca lanza. */
async function pingApi(): Promise<ApiHealth> {
  let detail = 'Sin conexión';
  for (let i = 0; i < 2; i++) {
    const started = Date.now();
    try {
      const res = await fetch(`${API_URL}/health`, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
      if (res.ok) return { ok: true, latencyMs: Date.now() - started, detail: null, checkedAt: new Date().toISOString() };
      detail = `HTTP ${res.status}`;
    } catch (e) {
      detail = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'No respondió en 8 s' : 'Sin conexión';
    }
  }
  return { ok: false, latencyMs: null, detail, checkedAt: new Date().toISOString() };
}

// Un minuto en caché: la página no le pega a Neon ni a la API en cada visita. unstable_cache
// no guarda los errores (la BD caída se vuelve a intentar en la siguiente visita).
const cachedChecks = unstable_cache(loadChecks, ['status-checks'], { revalidate: 60 });
const cachedPing = unstable_cache(pingApi, ['status-api-ping'], { revalidate: 60 });

/**
 * La caché entrega lo que tiene y renueva por detrás: tras horas sin visitas serían datos
 * viejos. Más de 3 minutos y se lee de nuevo.
 */
async function fresh<T>(cached: () => Promise<T>, load: () => Promise<T>, at: (v: T) => string): Promise<T> {
  const value = await cached();
  return Date.now() - Date.parse(at(value)) > 3 * 60_000 ? load() : value;
}

/** Los datos de la página y el momento en que se leyeron (contra él se calculan los "hace X min"). */
export async function readStatus(): Promise<{ checks: StatusChecks | null; health: ApiHealth; now: number }> {
  const [checks, health] = await Promise.all([
    fresh(cachedChecks, loadChecks, (c) => c.loadedAt).catch((e) => {
      console.error('No se pudo leer status_checks:', e);
      return null;
    }),
    fresh(cachedPing, pingApi, (h) => h.checkedAt),
  ]);
  return { checks, health, now: Date.now() };
}

// ---------- Cálculo ----------

export interface DayBar {
  date: string;
  level: DayLevel;
  /** Lo que se ve al pasar el mouse: fecha, disponibilidad y fallas. */
  label: string;
}

export interface ComponentState {
  component: StatusComponent;
  level: Level;
  /** Por qué no está "up" (o null). */
  detail: string | null;
  latencyMs: number | null;
  /** Disponibilidad en los 90 días (0 a 1) o null sin datos. */
  uptime: number | null;
  days: DayBar[];
}

export interface Incident {
  component: StatusComponent;
  start: string;
  /** null: sigue en curso. */
  end: string | null;
  minutes: number;
  detail: string | null;
}

export interface StatusView {
  components: ComponentState[];
  incidents: Incident[];
  overall: Level;
  /** Último chequeo guardado de cualquier componente. */
  lastCheckAt: string | null;
  /** La tabla no se pudo leer (BD caída o sin migrar): solo hay el ping a la API. */
  noHistory: boolean;
}

const DAY_MS = 86_400_000;
const limaDay = (t: number) => new Date(t - 5 * 3_600_000).toISOString().slice(0, 10);
const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

const dayFormat = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const pctFormat = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatUptime(ratio: number): string {
  // Sin redondear a 100.00 % un día con una falla.
  const pct = Math.floor(ratio * 10_000) / 100;
  return `${pctFormat.format(pct)} %`;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Chequeos de la API que no llegaron, por día de Lima (cada hueco cuenta los turnos perdidos). */
function missedApiChecks(gaps: { from: number; to: number }[]): Map<string, number> {
  const missed = new Map<string, number>();
  for (const { from, to } of gaps) {
    for (let slot = from + INTERVAL_MS; slot < to - INTERVAL_MS / 2; slot += INTERVAL_MS) {
      const day = limaDay(slot);
      missed.set(day, (missed.get(day) ?? 0) + 1);
    }
  }
  return missed;
}

function dayBar(date: string, row: Omit<DayRow, 'component' | 'day'> | undefined, missed: number): DayBar {
  const label = dayFormat.format(new Date(`${date}T12:00:00Z`));
  const total = (row?.total ?? 0) + missed;
  if (!total) return { date, level: 'none', label: `${label}: sin datos` };
  const up = row?.up ?? 0;
  const degraded = row?.degraded ?? 0;
  const down = (row?.down ?? 0) + missed;
  const ratio = (up + degraded) / total;
  const parts = [`${label}: ${formatUptime(ratio)} disponible`];
  if (down) parts.push(`${down} ${down === 1 ? 'chequeo' : 'chequeos'} sin respuesta (~${formatMinutes((down * INTERVAL_MS) / 60_000)})`);
  if (degraded) parts.push(`${degraded} con demoras`);
  if (!down && !degraded) parts.push('sin fallas');
  // Rojo: caídas que suman media hora o más. Ámbar: fallas más cortas, o demoras en al menos
  // el 10 % de los chequeos (unas demoras sueltas no pintan el día).
  const downMinutes = (down * INTERVAL_MS) / 60_000;
  const level: DayLevel = downMinutes >= MAJOR_DOWN_MINUTES ? 'major' : down || degraded / total >= 0.1 ? 'minor' : 'up';
  return { date, level, label: parts.join(' · ') };
}

const RANK: Record<Level, number> = { up: 0, unknown: 1, degraded: 2, down: 3 };

export function buildStatus(site: SiteId, checks: StatusChecks | null, health: ApiHealth, now = Date.now()): StatusView {
  const groups = groupsFor(site);
  const visible = COMPONENTS.filter((c) => groups.includes(c.group));
  const today = limaDay(now);
  const dates = Array.from({ length: HISTORY_DAYS }, (_, i) => shiftDay(today, i - HISTORY_DAYS + 1));

  const latest = new Map((checks?.latest ?? []).map((r) => [r.component, r]));
  const rows = new Map((checks?.days ?? []).map((r) => [`${r.component}|${r.day}`, r]));
  const lastApi = latest.get('api');
  const gaps = (checks?.apiGaps ?? []).map((g) => ({ from: Date.parse(g.from), to: Date.parse(g.to) }));
  // El hueco desde el último chequeo de la API hasta ahora (si ya se pasó de la cuenta).
  if (checks && lastApi && now - Date.parse(lastApi.checkedAt) > GAP_MS) gaps.push({ from: Date.parse(lastApi.checkedAt), to: now });
  const missed = missedApiChecks(gaps);

  const components = visible.map((component): ComponentState => {
    const days = dates.map((d) => dayBar(d, rows.get(`${component.id}|${d}`), component.id === 'api' ? (missed.get(d) ?? 0) : 0));
    let ok = 0;
    let total = 0;
    for (const d of dates) {
      const r = rows.get(`${component.id}|${d}`);
      const m = component.id === 'api' ? (missed.get(d) ?? 0) : 0;
      ok += (r?.up ?? 0) + (r?.degraded ?? 0);
      total += (r?.total ?? 0) + m;
    }
    const uptime = total ? ok / total : null;

    const last = latest.get(component.id);
    const stale = !last || now - Date.parse(last.checkedAt) > STALE_MS;
    if (component.id === 'api') {
      // La API se mira en vivo; el worker es el que guarda los chequeos.
      if (!health.ok) return { component, level: 'down', detail: health.detail, latencyMs: null, uptime, days };
      // Solo si el worker ya corrió alguna vez: antes del primer chequeo no hay nada atrasado.
      if (checks && last && stale) {
        return { component, level: 'degraded', detail: 'Responde, pero el monitoreo no corre: los webhooks pueden demorar', latencyMs: health.latencyMs, uptime, days };
      }
      return { component, level: 'up', detail: null, latencyMs: health.latencyMs, uptime, days };
    }
    if (stale) return { component, level: 'unknown', detail: checks ? 'Sin chequeos recientes' : null, latencyMs: null, uptime, days };
    return { component, level: last.status, detail: last.status === 'up' ? null : last.detail, latencyMs: last.latencyMs, uptime, days };
  });

  const incidents: Incident[] = [];
  const since = now - INCIDENT_DAYS * DAY_MS;
  const byId = new Map(visible.map((c) => [c.id, c]));
  // Chequeos sin respuesta seguidos: un incidente.
  let episode: { component: string; first: number; last: number; detail: string | null } | null = null;
  const close = () => {
    if (!episode) return;
    const component = byId.get(episode.component);
    const last = latest.get(episode.component);
    const ongoing = last?.status === 'down' && Date.parse(last.checkedAt) === episode.last;
    if (component) {
      incidents.push({
        component,
        start: new Date(episode.first).toISOString(),
        end: ongoing ? null : new Date(episode.last + INTERVAL_MS).toISOString(),
        minutes: (episode.last - episode.first + INTERVAL_MS) / 60_000,
        detail: episode.detail,
      });
    }
    episode = null;
  };
  for (const d of checks?.downs ?? []) {
    const t = Date.parse(d.checkedAt);
    if (episode && (episode.component !== d.component || t - episode.last > GAP_MS)) close();
    if (episode) {
      episode.last = t;
      episode.detail = d.detail ?? episode.detail;
    } else episode = { component: d.component, first: t, last: t, detail: d.detail };
  }
  close();
  const api = byId.get('api');
  if (api) {
    for (const g of gaps) {
      if (g.to < since) continue;
      const ongoing = g.to === now;
      incidents.push({
        component: api,
        start: new Date(g.from + INTERVAL_MS).toISOString(),
        end: ongoing ? null : new Date(g.to).toISOString(),
        minutes: (g.to - g.from - INTERVAL_MS) / 60_000,
        detail: ongoing && health.ok ? 'El monitoreo no corre (la API responde)' : 'Los chequeos de la API no llegaron',
      });
    }
  }
  incidents.sort((a, b) => b.start.localeCompare(a.start));

  const overall = components.reduce<Level>((worst, c) => (RANK[c.level] > RANK[worst] ? c.level : worst), 'up');
  const lastCheckAt = (checks?.latest ?? []).reduce<string | null>((max, r) => (!max || r.checkedAt > max ? r.checkedAt : max), null);
  return { components, incidents: incidents.slice(0, 10), overall, lastCheckAt, noHistory: !checks };
}
