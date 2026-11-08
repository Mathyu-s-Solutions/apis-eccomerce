import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';

/**
 * Tipo de cambio que publica la SBS (dólar) y el del euro, tomados de la API de series del
 * BCRP: la misma fuente que usa GET /v1/sunat/exchange-rate en el backend
 * (backend/src/modules/sunat/consultas/exchange-rate.service.ts). Alimenta las páginas
 * /tipo-de-cambio, que se renuevan solas cada día con datos reales.
 */

const SERIES = 'PD04639PD-PD04640PD-PD04647PD-PD04648PD'; // USD compra, USD venta, EUR compra, EUR venta
const BCRP = 'https://estadisticas.bcrp.gob.pe/estadisticas/series/api';
const MONTH_CODES: Record<string, string> = { ene: '01', jan: '01', feb: '02', mar: '03', abr: '04', apr: '04', may: '05', jun: '06', jul: '07', ago: '08', aug: '08', set: '09', sep: '09', oct: '10', nov: '11', dic: '12', dec: '12' };

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
/** Primer mes con página propia. */
export const FIRST_MONTH = { year: 2015, month: 1 };

export interface DayRate {
  /** AAAA-MM-DD */
  date: string;
  usdBuy: number | null;
  usdSell: number | null;
  eurBuy: number | null;
  eurSell: number | null;
}

/** "09.Oct.26" → "2026-10-09" */
function periodDate(name: string): string | null {
  const m = /^(\d{2})\.([A-Za-z]{3})\.(\d{2})$/.exec(name.trim());
  const month = m && MONTH_CODES[m[2].toLowerCase()];
  return m && month ? `20${m[3]}-${month}-${m[1]}` : null;
}

const num = (v: string | undefined) => (v && /^\d/.test(v) ? Number(v) : null);

async function fetchRange(from: string, to: string): Promise<DayRate[]> {
  const url = `${BCRP}/${SERIES}/json/${from}/${to}`;
  let last: unknown;
  // El BCRP responde con HTML a las consultas muy seguidas: se espera y se reintenta.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        // Sin un User-Agent de navegador, su PHP pega una traza de error después del JSON.
        headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; MathyuAPIs/1.0)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const extra = text.search(/<[a-z!]/i);
      if (extra === 0) throw new Error('el BCRP respondió HTML en vez de JSON');
      const periods = (JSON.parse(extra > 0 ? text.slice(0, extra) : text) as { periods?: { name: string; values: string[] }[] }).periods;
      if (!Array.isArray(periods)) throw new Error('respuesta sin periodos');
      return periods
        .map((p) => ({ date: periodDate(p.name) ?? '', usdBuy: num(p.values[0]), usdSell: num(p.values[1]), eurBuy: num(p.values[2]), eurSell: num(p.values[3]) }))
        .filter((d) => d.date && (d.usdBuy !== null || d.usdSell !== null));
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

// unstable_cache no guarda nada si la función falla: un error del BCRP no queda cacheado.
const recentRates = unstable_cache(fetchRange, ['bcrp-exchange-recent'], { revalidate: 1800 });
const closedRates = unstable_cache(fetchRange, ['bcrp-exchange-closed'], { revalidate: 30 * 86_400 });

/** Fecha de hoy en Lima (AAAA-MM-DD). */
export function limaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Los últimos ~30 días hábiles con cotización, del más antiguo al más reciente. */
export const latestRates = cache((): Promise<DayRate[]> => {
  const today = limaToday();
  return recentRates(shift(today, -45), today);
});

/** Los días con cotización de un mes (hasta hoy, si es el mes en curso). */
export const monthRates = cache((year: number, month: number): Promise<DayRate[]> => {
  const mm = String(month).padStart(2, '0');
  const from = `${year}-${mm}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  const today = limaToday();
  // Un mes cerrado hace más de una semana ya no cambia.
  return to < shift(today, -7) ? closedRates(from, to) : recentRates(from, to < today ? to : today);
});

/** "octubre-2026" ↔ { year, month }. Acepta "septiembre" (se redirige a "setiembre"). */
export function parsePeriod(slug: string): { year: number; month: number } | null {
  const m = /^([a-z]+)-(\d{4})$/.exec(slug);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1] === 'septiembre' ? 'setiembre' : m[1]) + 1;
  const year = Number(m[2]);
  if (!month) return null;
  return { year, month };
}

export function periodSlug(year: number, month: number): string {
  return `${MONTHS[month - 1]}-${year}`;
}

export function periodLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

/** ¿Hay página para ese mes? Desde FIRST_MONTH hasta el mes en curso. */
export function periodInRange(year: number, month: number): boolean {
  const [ty, tm] = limaToday().split('-').map(Number);
  const key = year * 12 + month;
  return key >= FIRST_MONTH.year * 12 + FIRST_MONTH.month && key <= ty * 12 + tm;
}

/** Todos los meses con página, del más reciente al más antiguo. */
export function allPeriods(): { year: number; month: number }[] {
  const [ty, tm] = limaToday().split('-').map(Number);
  const out: { year: number; month: number }[] = [];
  for (let key = ty * 12 + tm - 1; key >= FIRST_MONTH.year * 12 + FIRST_MONTH.month - 1; key--) {
    out.push({ year: Math.floor(key / 12), month: (key % 12) + 1 });
  }
  return out;
}

export function formatRate(v: number | null): string {
  return v === null ? '—' : v.toFixed(3);
}

/** "2026-11-05" → "jueves 5 de noviembre de 2026" (o sin el día de la semana). */
export function formatDay(iso: string, weekday = false): string {
  return new Intl.DateTimeFormat('es-PE', { weekday: weekday ? 'long' : undefined, day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );
}

export interface MonthSummary {
  days: number;
  first: DayRate;
  last: DayRate;
  avgBuy: number;
  avgSell: number;
  minSell: DayRate;
  maxSell: DayRate;
}

export function summarize(rates: DayRate[]): MonthSummary | null {
  const usd = rates.filter((r) => r.usdBuy !== null && r.usdSell !== null);
  if (!usd.length) return null;
  const avg = (k: 'usdBuy' | 'usdSell') => usd.reduce((s, r) => s + (r[k] as number), 0) / usd.length;
  const bySell = [...usd].sort((a, b) => (a.usdSell as number) - (b.usdSell as number));
  return { days: usd.length, first: usd[0], last: usd.at(-1)!, avgBuy: avg('usdBuy'), avgSell: avg('usdSell'), minSell: bySell[0], maxSell: bySell.at(-1)! };
}
