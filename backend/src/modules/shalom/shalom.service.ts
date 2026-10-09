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
import { CAPTCHA_PROVIDER, type CaptchaProvider } from './captcha/captcha.provider';
import { mapShalomAgency, mapShalomStatus, type ShalomSearch } from './shalom.mapper';

const HOUR = 60 * 60 * 1000;
const byName = (a: Place, b: Place) => a.name.localeCompare(b.name, 'es');

/** Una guía encontrada con su clave: el ose_id (para rastrearla sin captcha) y los datos de la búsqueda. */
export interface ShalomGuide {
  oseId: string;
  search: ShalomSearch;
}

/** Guía resuelta: recién buscada (con `search`) o del caché (sin captcha). */
export interface ResolvedGuide {
  oseId: string;
  search?: ShalomSearch;
  transitTime: string | null;
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
  // Un minuto: el que consulta seguido la misma guía no le pega a Shalom cada vez.
  private readonly statusCache = new TtlCache<{ message?: string; data?: Record<string, any> }>(60_000);
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
   * Estado por ose_id. Endpoint abierto (sin captcha).
   * ⚠️ Los ose_id son correlativos: usar SOLO ids que el cliente provea (o que
   * resolvimos con su guía y clave), nunca enumerarlos. Ver docs/investigacion-upstreams.md §1.1 y §4.
   */
  async statusByOseId(oseId: string, trackingNumber = oseId, search?: ShalomSearch): Promise<TrackingResult> {
    const res = await this.statusCache.get(oseId, () =>
      this.web.post<{ message?: string; data?: Record<string, any> }>('rastrea/estados', { ose_id: oseId }),
    );
    return mapShalomStatus(trackingNumber, res?.message, res?.data ?? null, search);
  }

  /**
   * De guía + clave al ose_id. Resuelve un reCAPTCHA (action rastrea_buscar):
   * con SHALOM_CAPTCHA_PROVIDER=none devuelve 501. `null` = Shalom no tiene
   * esa guía con esa clave.
   */
  async findGuide(query: TrackQuery): Promise<ShalomGuide | null> {
    const recaptchaToken = await this.captcha.getToken('rastrea_buscar');
    let found: { data?: Record<string, any> };
    try {
      found = await this.web.post<{ data?: Record<string, any> }>('rastrea/buscar', {
        numero: query.orderNumber,
        codigo: query.orderCode ?? '',
        ose_id: '',
        recaptcha_token: recaptchaToken,
      });
    } catch (err) {
      // Shalom responde 400 "No se encontró la orden de servicio."
      if (err instanceof UpstreamError && err.getStatus() === 400 && /no se encontr/i.test(err.message)) {
        return null;
      }
      throw err;
    }
    const oseId = found?.data?.ose_id;
    return oseId ? { oseId: String(oseId), search: found.data ?? {} } : null;
  }

  /**
   * Guía + clave → ose_id. La primera vez resuelve el captcha y lo guarda (sin
   * la clave); las siguientes salen del caché. `null` = no existe.
   */
  async resolveGuide(query: TrackQuery): Promise<ResolvedGuide | null> {
    const key = await guideKey(query.orderNumber, query.orderCode ?? '');
    const cached = await this.guides.find(key);
    if (cached) return { oseId: cached.oseId, transitTime: cached.transitTime };
    const found = await this.findGuide(query);
    if (!found) return null;
    const transitTime = typeof found.search.tiempo_llegada === 'string' && found.search.tiempo_llegada.trim() ? found.search.tiempo_llegada.trim() : null;
    await this.guides.save(key, { oseId: found.oseId, transitTime });
    return { oseId: found.oseId, search: found.search, transitTime };
  }

  /** Estado de una guía ya resuelta (con la búsqueda si es reciente; si no, por sus hitos). */
  async statusOf(guide: ResolvedGuide, trackingNumber: string): Promise<TrackingResult> {
    const result = await this.statusByOseId(guide.oseId, trackingNumber, guide.search);
    if (!guide.search && !result.delivered && guide.transitTime) result.transitTime = guide.transitTime;
    return result;
  }

  /** Rastreo por guía + clave. `null` = Shalom no tiene esa guía con esa clave. */
  async track(query: TrackQuery): Promise<TrackingResult | null> {
    const guide = await this.resolveGuide(query);
    return guide ? this.statusOf(guide, query.orderNumber) : null;
  }

  /**
   * Varias guías, en el mismo orden; `null` en las que no existen. Cada guía
   * resuelve su captcha: van de a tantas como páginas tenga el pool de Chromium.
   */
  async trackBatch(queries: TrackQuery[]): Promise<Array<TrackingResult | null>> {
    const results: Array<TrackingResult | null> = new Array(queries.length).fill(null);
    let next = 0;
    const worker = async () => {
      while (next < queries.length) {
        const i = next++;
        results[i] = await this.track(queries[i]);
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
