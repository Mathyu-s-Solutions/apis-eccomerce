import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  Agency,
  CourierAdapter,
  Place,
  TrackQuery,
} from '../../common/courier/courier-adapter.interface';
import type { TrackingResult } from '../../common/courier/tracking.model';
import { TtlCache } from '../../common/cache/ttl-cache';
import { filterAgencies } from '../../common/courier/agency-search';
import { departmentId, provinceId } from '../../common/courier/locations';
import { UpstreamError } from '../../common/errors/upstream.error';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { ShalomWebClient } from './shalom-web.client';
import { guideKey, ShalomGuideCache } from './shalom-guide-cache';
import { CAPTCHA_PROVIDER, type CaptchaProvider } from '../../common/captcha/captcha.provider';
import { mapShalomAgency, mapShalomStatus, type ShalomSearch } from './shalom.mapper';

const HOUR = 60 * 60 * 1000;
/** Lo que espera su turno cada guía de /track/batch (Cloud Run corta a los 300 s). */
const BATCH_MAX_WAIT_MS = 150_000;
const byName = (a: Place, b: Place) => a.name.localeCompare(b.name, 'es');

/** Una guía buscada y sus estados, leídos en la misma sesión de Shalom. */
interface ShalomLookup {
  oseId: string;
  search: ShalomSearch;
  message?: string;
  data: Record<string, any> | null;
}

/** Cómo se busca una guía en Shalom: con guía + clave, o con su ose_id. */
export type LookupBy ={ orderNumber: string; orderCode: string } | { oseId: string };

/** Una guía rastreada y su ose_id (lo que guarda la suscripción, nunca la clave). */
export interface TrackedGuide {
  oseId: string;
  tracking: TrackingResult;
}

export interface ShalomQuote {
  origin: { code: string; name: string };
  destination: { code: string; name: string };
  service: 'ground' | 'air';
  leadTime: string | null;
  distanceKm: number | null;
  currency: 'PEN';
  /** Mínimo por carga (peso o volumen). */
  minimumCharge: number | null;
  /** Precio por tamaño de caja (sobre, paquete XXS a L). */
  packages: Record<'envelope' | 'xxs' | 'xs' | 's' | 'm' | 'l', number | null>;
  /** Recargo por entrega a domicilio en el distrito de destino, por tamaño. */
  homeDelivery?: Array<{ size: string; price: number }>;
  raw?: unknown;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

@Injectable()
export class ShalomService implements CourierAdapter {
  readonly carrier = 'shalom' as const;
  private readonly agenciesCache = new TtlCache<Agency[]>(6 * HOUR);
  private readonly placesCache = new TtlCache<Place[]>(24 * HOUR);
  // Un minuto por ose_id: el que consulta seguido la misma guía no gasta un captcha cada vez.
  private readonly statusCache = new TtlCache<ShalomLookup | null>(60_000);
  // Las tarifas cambian poco: un captcha por ruta cada 6 h.
  private readonly quoteCache = new TtlCache<Record<string, any>>(6 * HOUR);
  private readonly repartoCache = new TtlCache<Array<{ size: string; price: number }>>(24 * HOUR);

  constructor(
    private readonly web: ShalomWebClient,
    @Inject(CAPTCHA_PROVIDER) private readonly captcha: CaptchaProvider,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
    private readonly guides: ShalomGuideCache,
  ) {}

  /** Todas las agencias (sin captcha, con caché de 6 h). */
  allAgencies(): Promise<Agency[]> {
    return this.agenciesCache.get(
      'all',
      async () => {
        const res = await this.web.post<{ data: Array<Record<string, any>> }>('agencias/listar', {});
        return (res?.data ?? []).map(mapShalomAgency);
      },
      (l) => l.length > 0,
    );
  }

  async agencies(filter: { q?: string; department?: string; province?: string; district?: string } = {}): Promise<Agency[]> {
    return filterAgencies(await this.allAgencies(), filter);
  }

  // ─── Ubicaciones (los ids de Shalom son los códigos del INEI) ──────────────

  private places(route: string, body: Record<string, number>, toId: (row: Record<string, any>) => string): Promise<Place[]> {
    return this.placesCache.get(
      `${route}:${JSON.stringify(body)}`,
      async () => {
        const res = await this.web.post<{ data?: Array<Record<string, any>> }>(route, body);
        return (res?.data ?? []).map((r) => ({ id: toId(r), name: String(r.name ?? '').trim() })).sort(byName);
      },
      (l) => l.length > 0,
    );
  }

  departments(): Promise<Place[]> {
    return this.places('agencias/departamentos', {}, (r) => String(r.id).padStart(2, '0'));
  }

  async provinces(department: string): Promise<Place[] | null> {
    const dep = departmentId(department);
    if (!dep || !(await this.departments()).some((d) => d.id === dep)) return null;
    return this.places('agencias/provincias', { depid: Number(dep) }, (r) => `${dep}${String(r.id).padStart(2, '0')}`);
  }

  async districts(department: string, province: string): Promise<Place[] | null> {
    const dep = departmentId(department);
    const prov = dep && provinceId(dep, province);
    if (!dep || !prov) return null;
    const provinces = await this.provinces(dep);
    if (!provinces?.some((p) => p.id === prov)) return null;
    return this.places('agencias/distritos', { depid: Number(dep), provid: Number(prov.slice(2)) }, (r) =>
      r.ubi_id ? String(r.ubi_id).padStart(6, '0') : `${prov}${String(r.id).padStart(2, '0')}`,
    );
  }

  // ─── Rastreo ───────────────────────────────────────────────────────────────

  /**
   * Busca la guía (rastrea/buscar, un reCAPTCHA de action rastrea_buscar) y lee
   * sus estados en la misma sesión: desde nov-2026 rastrea/estados solo responde
   * la orden que buscó esa sesión. Con SHALOM_CAPTCHA_PROVIDER=none devuelve 501.
   * `null` = Shalom no tiene esa guía (con esa clave, o con ese ose_id).
   */
  private async lookup(by: LookupBy, maxWaitMs?: number): Promise<ShalomLookup | null> {
    // Primero el turno (Shalom corta pasadas ~20 búsquedas por minuto): si no hay, el 503
    // sale sin gastar captcha. Luego el token, y recién la sesión: dura 120 s.
    await this.web.trackSlot(maxWaitMs);
    const recaptchaToken = await this.captcha.getToken('rastrea_buscar');
    const found = await this.web.isolated(async (post) => {
      let found: { data?: Record<string, any> };
      try {
        found = await post<{ data?: Record<string, any> }>('rastrea/buscar', {
          numero: 'oseId' in by ? '' : by.orderNumber,
          codigo: 'oseId' in by ? '' : by.orderCode,
          ose_id: 'oseId' in by ? by.oseId : '',
          recaptcha_token: recaptchaToken,
        });
      } catch (err) {
        // Shalom responde "No se encontró la orden de servicio."
        if (err instanceof UpstreamError && err.getStatus() === 400 && /no se encontr/i.test(err.message)) {
          return null;
        }
        throw err;
      }
      const oseId = found?.data?.ose_id;
      if (!oseId) return null;
      const status = await post<{ message?: string; data?: Record<string, any> }>('rastrea/estados', { ose_id: String(oseId) });
      return { oseId: String(oseId), search: found.data ?? {}, message: status?.message, data: status?.data ?? null };
    });
    if (found) this.lastFoundAt = Date.now();
    return found;
  }

  /** Cuándo se rastreó completa (buscar y estados) una guía por última vez en esta instancia. */
  private lastFoundAt = 0;

  /** Si en los últimos `ms` se rastreó completa alguna guía: el rastreo funciona. */
  trackedRecently(ms: number): boolean {
    return Date.now() - this.lastFoundAt < ms;
  }

  /**
   * Para la página de estado: el rastreo completo (captcha, buscar y estados), sin
   * cachés. `null` = Shalom no tiene esa guía.
   */
  async probe(by: LookupBy, maxWaitMs?: number): Promise<TrackingResult | null> {
    const found = await this.lookup(by, maxWaitMs);
    return found && ShalomService.toResult(found, found.oseId);
  }

  /** Lo consultado hace menos de un minuto sale del caché, sin captcha. */
  private lookupCached(oseId: string, by: LookupBy, maxWaitMs?: number): Promise<ShalomLookup | null> {
    return this.statusCache.get(oseId, () => this.lookup(by, maxWaitMs), (found) => found !== null);
  }

  private static toResult(found: ShalomLookup, trackingNumber: string): TrackingResult {
    return mapShalomStatus(trackingNumber, found.message, found.data, found.search);
  }

  /**
   * Estado por ose_id (un captcha, como el rastreo por guía). `null` = Shalom no
   * tiene ese ose_id.
   * ⚠️ Los ose_id son correlativos: usar SOLO ids que el cliente provea (o que
   * resolvimos con su guía y clave), nunca enumerarlos. Ver docs/investigacion-upstreams.md §1.1 y §4.
   */
  async statusByOseId(oseId: string, trackingNumber = oseId): Promise<TrackingResult | null> {
    const found = await this.lookupCached(oseId, { oseId });
    return found && ShalomService.toResult(found, trackingNumber);
  }

  /**
   * Rastreo por guía + clave, con su ose_id. El ose_id se guarda (sin la clave):
   * con él, consultar de nuevo antes del minuto no gasta captcha. `null` = Shalom
   * no tiene esa guía con esa clave.
   */
  async trackGuide(query: TrackQuery, opts: { maxWaitMs?: number } = {}): Promise<TrackedGuide | null> {
    const by = { orderNumber: query.orderNumber, orderCode: query.orderCode ?? '' };
    const key = await guideKey(by.orderNumber, by.orderCode);
    const cached = await this.guides.find(key);
    let found: ShalomLookup | null;
    if (cached) {
      found = await this.lookupCached(cached.oseId, by, opts.maxWaitMs);
      if (found) this.guides.touch(key);
    } else {
      found = await this.lookup(by, opts.maxWaitMs);
      if (!found) return null;
      const t = found.search.tiempo_llegada;
      await this.guides.save(key, { oseId: found.oseId, transitTime: typeof t === 'string' && t.trim() ? t.trim() : null });
      // Así la siguiente consulta antes del minuto no vuelve a Shalom.
      this.statusCache.set(found.oseId, found);
    }
    return found && { oseId: found.oseId, tracking: ShalomService.toResult(found, query.orderNumber) };
  }

  /** Rastreo por guía + clave. `null` = Shalom no tiene esa guía con esa clave. */
  async track(query: TrackQuery, opts: { maxWaitMs?: number } = {}): Promise<TrackingResult | null> {
    return (await this.trackGuide(query, opts))?.tracking ?? null;
  }

  /**
   * Varias guías, en el mismo orden; `null` en las que no existen. Cada guía
   * resuelve su captcha: van de a tantas como páginas tenga el pool de Chromium,
   * al ritmo que admite Shalom (20 guías: ~1 min). Cada una espera su turno hasta
   * BATCH_MAX_WAIT_MS, no los 20 s de un rastreo suelto.
   */
  async trackBatch(queries: TrackQuery[]): Promise<Array<TrackingResult | null>> {
    const results: Array<TrackingResult | null> = new Array(queries.length).fill(null);
    let next = 0;
    const worker = async () => {
      while (next < queries.length) {
        const i = next++;
        results[i] = await this.track(queries[i], { maxWaitMs: BATCH_MAX_WAIT_MS });
      }
    };
    const lanes = Math.max(1, Math.min(this.config.shalom.captcha.poolSize, queries.length));
    await Promise.all(Array.from({ length: lanes }, worker));
    return results;
  }

  // ─── Cotización ────────────────────────────────────────────────────────────

  /**
   * Tarifa entre dos agencias (por su `code`), terrestre o aérea. Resuelve un
   * captcha (action tarifa_mostrar) por ruta cada 6 h. Con `homeDelivery`, suma
   * el recargo por entregar a domicilio en el distrito de la agencia de destino.
   */
  async quote(input: { origin: string; destination: string; air?: boolean; homeDelivery?: boolean }): Promise<ShalomQuote> {
    const agencies = await this.allAgencies();
    const origin = agencies.find((a) => a.code === input.origin);
    const destination = agencies.find((a) => a.code === input.destination);
    if (!origin) throw new BadRequestException(`No existe la agencia de origen ${input.origin} (usa el code de GET /v1/shalom/agencies).`);
    if (!destination) throw new BadRequestException(`No existe la agencia de destino ${input.destination}.`);
    if (origin.sendsShipments === false) throw new BadRequestException(`La agencia ${origin.name} no despacha envíos.`);
    if (!destination.receivesShipments) throw new BadRequestException(`La agencia ${destination.name} no recibe envíos.`);
    if (input.air && !destination.airService) throw new BadRequestException(`La agencia ${destination.name} no recibe envíos aéreos.`);

    const air = !!input.air;
    const data = await this.quoteCache.get(`${origin.code}:${destination.code}:${air}`, async () => {
      const res = await this.web.post<{ data?: Record<string, any> }>('tarifa/mostrar', {
        origin: Number(origin.code),
        // Shalom marca el destino aéreo con un 0 delante.
        destiny: air ? `0${destination.code}` : Number(destination.code),
        recaptcha_token: await this.captcha.getToken('tarifa_mostrar'),
      });
      return res?.data ?? {};
    });
    const t = (data.tariff ?? {}) as Record<string, unknown>;
    const quote: ShalomQuote = {
      origin: { code: origin.code, name: origin.name },
      destination: { code: destination.code, name: destination.name },
      service: air ? 'air' : 'ground',
      leadTime: data.lead_time ?? data.data_tarifa?.lead_time ?? null,
      distanceKm: num(data.data_tarifa?.distancia) || null,
      currency: 'PEN',
      minimumCharge: num(data.price),
      packages: {
        envelope: num(t.sobre),
        xxs: num(t.cajapaquetexxs),
        xs: num(t.cajapaquetexs),
        s: num(t.cajapaquetes),
        m: num(t.cajapaquetem),
        l: num(t.cajapaquetel),
      },
      raw: data,
    };
    if (input.homeDelivery) quote.homeDelivery = await this.homeDelivery(destination);
    return quote;
  }

  /** Recargo de reparto a domicilio en el distrito de una agencia (sin captcha). */
  private homeDelivery(agency: Agency) {
    const r = (agency.raw ?? {}) as Record<string, unknown>;
    const body = { dep_id: Number(r.dep_id), prov_id: Number(r.prov_id), dist_id: Number(r.dist_id) };
    return this.repartoCache.get(
      JSON.stringify(body),
      async () => {
        const res = await this.web.post<{ data?: Array<Record<string, unknown>> }>('tarifa/reparto', body);
        return (res?.data ?? []).map((x) => ({ size: String(x.des_nombre ?? '').replace(/\s+/g, ' ').trim(), price: Number(x.cs_costo) }));
      },
      (l) => l.length > 0,
    );
  }
}
