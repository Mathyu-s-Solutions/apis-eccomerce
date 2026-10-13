import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../../config/configuration';
import { PrismaService } from '../../../prisma/prisma.service';
import { limaNow } from '../core/time';

/**
 * Tipo de cambio que publica la SBS, tomado de la API de estadísticas del BCRP
 * (series diarias "TC Sistema bancario SBS"). Es la fuente oficial y abierta:
 * las webs de la SBS y de SUNAT bloquean las consultas automáticas.
 */
const SERIES = [
  { currency: 'USD', description: 'Dólar de N.A.', purchase: 'PD04639PD', sale: 'PD04640PD' },
  { currency: 'EUR', description: 'Euro', purchase: 'PD04647PD', sale: 'PD04648PD' },
] as const;
const BCRP = 'https://estadisticas.bcrp.gob.pe/estadisticas/series/api';
const MONTHS: Record<string, string> = { ene: '01', jan: '01', feb: '02', mar: '03', abr: '04', apr: '04', may: '05', jun: '06', jul: '07', ago: '08', aug: '08', set: '09', sep: '09', oct: '10', nov: '11', dic: '12', dec: '12' };

export interface ExchangeRate {
  currency_description: string;
  /** Fecha de la cotización (el último día hábil hasta la fecha pedida). */
  date: string;
  purchase: string | null;
  sale: string | null;
  source: 'SBS';
  last_update: string;
}

/** "09.Oct.26" → "2026-10-09" */
function periodDate(name: string): string | null {
  const m = /^(\d{2})\.([A-Za-z]{3})\.(\d{2})$/.exec(name.trim());
  const month = m && MONTHS[m[2].toLowerCase()];
  return m && month ? `20${m[3]}-${month}-${m[1]}` : null;
}

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** La cotización de hoy puede salir más tarde: se vuelve a pedir pasado este tiempo. */
const TODAY_TTL_MS = 30 * 60_000;

interface Period {
  name: string;
  values: string[];
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private readonly memory = new Map<string, { rates: Record<string, ExchangeRate>; expiresAt: number }>();
  private readonly pending = new Map<string, Promise<Period[]>>();
  private readonly timeoutMs: number;

  constructor(
    @Inject(CONFIG_TOKEN) config: AppConfig,
    private readonly prisma: PrismaService,
  ) {
    this.timeoutMs = config.http.timeoutMs;
  }

  /** Tipo de cambio vigente en `date` (hoy si no se indica). */
  async rates(date?: string): Promise<Record<string, ExchangeRate>> {
    const today = limaNow().date;
    const day = date ?? today;
    const fresh = (updatedAt: number, quoted: string) => day < today || quoted === day || Date.now() - updatedAt < TODAY_TTL_MS;

    const hit = this.memory.get(day);
    if (hit && hit.expiresAt > Date.now()) return hit.rates;

    const stored = await this.load(day);
    if (stored && Object.values(stored).every((r) => fresh(Date.parse(`${r.last_update.replace(' ', 'T')}-05:00`), r.date))) return this.remember(day, today, stored);

    let rates: Record<string, ExchangeRate>;
    try {
      // Varias requests por la misma fecha comparten una sola consulta al BCRP.
      let pending = this.pending.get(day);
      if (!pending) {
        pending = this.fetchPeriods(day).finally(() => this.pending.delete(day));
        this.pending.set(day, pending);
      }
      rates = this.pick(await pending);
    } catch (e) {
      this.logger.warn(`El BCRP no respondió el tipo de cambio de ${day}: ${String(e)}`);
      // Mejor el último dato guardado que ninguno.
      if (stored) return stored;
      if (hit) return hit.rates;
      throw new ServiceUnavailableException('El tipo de cambio no está disponible en este momento. Inténtalo de nuevo en unos minutos.');
    }
    await this.save(day, rates);
    return this.remember(day, today, rates);
  }

  private remember(day: string, today: string, rates: Record<string, ExchangeRate>): Record<string, ExchangeRate> {
    this.memory.set(day, { rates, expiresAt: Date.now() + (day < today ? 24 * 3_600_000 : 5 * 60_000) });
    if (this.memory.size > 500) this.memory.delete(this.memory.keys().next().value as string);
    return rates;
  }

  /** Diez días hacia atrás: cubre fines de semana y feriados largos. */
  private async fetchPeriods(day: string): Promise<Period[]> {
    const codes = SERIES.flatMap((s) => [s.purchase, s.sale]).join('-');
    const url = `${BCRP}/${codes}/json/${shift(day, -10)}/${day}`;
    let last: unknown;
    // El BCRP responde con una página HTML a las consultas muy seguidas: se espera y se reintenta.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
      try {
        const res = await fetch(url, {
          // Sin un User-Agent de navegador, su PHP pega una traza de error después del JSON.
          headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; MathyuAPIs/1.0)' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        // Por si acaso: si igual llega HTML después del JSON, se lee solo el JSON.
        const extra = text.search(/<[a-z!]/i);
        if (extra === 0) throw new Error('respondió HTML en vez de JSON');
        const periods = (JSON.parse(extra > 0 ? text.slice(0, extra) : text) as { periods?: Period[] }).periods;
        if (!Array.isArray(periods)) throw new Error('respuesta sin periodos');
        return periods;
      } catch (e) {
        last = e;
      }
    }
    throw last;
  }

  /** Por moneda, la última fecha que trae compra o venta ("n.d." = no hubo cotización). */
  private pick(periods: Period[]): Record<string, ExchangeRate> {
    const rates: Record<string, ExchangeRate> = {};
    const now = limaNow();
    SERIES.forEach((s, i) => {
      for (let p = periods.length - 1; p >= 0; p--) {
        const [purchase, sale] = [periods[p].values[i * 2], periods[p].values[i * 2 + 1]].map((v) => (v && /^\d/.test(v) ? Number(v).toFixed(4) : null));
        const quoted = periodDate(periods[p].name);
        if ((purchase || sale) && quoted) {
          rates[s.currency] = { currency_description: s.description, date: quoted, purchase, sale, source: 'SBS', last_update: `${now.date} ${now.time}` };
          break;
        }
      }
    });
    return rates;
  }

  private async load(day: string): Promise<Record<string, ExchangeRate> | null> {
    if (!this.prisma.enabled) return null;
    const rows = await this.prisma.sunatExchangeRate.findMany({ where: { date: day } });
    if (!rows.length) return null;
    const rates: Record<string, ExchangeRate> = {};
    for (const row of rows) {
      const updated = limaNow(row.updatedAt);
      rates[row.currency] = {
        currency_description: SERIES.find((s) => s.currency === row.currency)?.description ?? row.currency,
        date: row.quotedDate,
        purchase: row.purchase?.toFixed(4) ?? null,
        sale: row.sale?.toFixed(4) ?? null,
        source: 'SBS',
        last_update: `${updated.date} ${updated.time}`,
      };
    }
    return rates;
  }

  private async save(day: string, rates: Record<string, ExchangeRate>): Promise<void> {
    if (!this.prisma.enabled) return;
    try {
      await this.prisma.$transaction(
        Object.entries(rates).map(([currency, r]) =>
          this.prisma.sunatExchangeRate.upsert({
            where: { date_currency: { date: day, currency } },
            create: { date: day, currency, quotedDate: r.date, purchase: r.purchase, sale: r.sale },
            update: { quotedDate: r.date, purchase: r.purchase, sale: r.sale },
          }),
        ),
      );
    } catch (e) {
      this.logger.warn(`No se pudo guardar el tipo de cambio de ${day}: ${String(e)}`);
    }
  }
}
