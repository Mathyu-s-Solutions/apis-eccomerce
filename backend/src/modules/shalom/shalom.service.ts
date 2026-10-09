import { Inject, Injectable } from '@nestjs/common';
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
import { CAPTCHA_PROVIDER, type CaptchaProvider } from './captcha/captcha.provider';
import { mapShalomAgency, mapShalomStatus, type ShalomSearch } from './shalom.mapper';

const HOUR = 60 * 60 * 1000;
const byName = (a: Place, b: Place) => a.name.localeCompare(b.name, 'es');

/** Una guía encontrada con su clave: el ose_id (para rastrearla sin captcha) y los datos de la búsqueda. */
export interface ShalomGuide {
  oseId: string;
  search: ShalomSearch;
}

@Injectable()
export class ShalomService implements CourierAdapter {
  readonly carrier = 'shalom' as const;
  private readonly agenciesCache = new TtlCache<Agency[]>(6 * HOUR);
  private readonly placesCache = new TtlCache<Place[]>(24 * HOUR);

  constructor(
    private readonly web: ShalomWebClient,
    @Inject(CAPTCHA_PROVIDER) private readonly captcha: CaptchaProvider,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
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
    const res = await this.web.post<{ message?: string; data?: Record<string, any> }>(
      'rastrea/estados',
      { ose_id: oseId },
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

  /** Rastreo por guía + clave. `null` = Shalom no tiene esa guía con esa clave. */
  async track(query: TrackQuery): Promise<TrackingResult | null> {
    const guide = await this.findGuide(query);
    return guide ? this.statusByOseId(guide.oseId, query.orderNumber, guide.search) : null;
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
}
