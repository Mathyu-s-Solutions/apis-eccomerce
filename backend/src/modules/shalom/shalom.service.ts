import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  Agency,
  CourierAdapter,
  TrackQuery,
} from '../../common/courier/courier-adapter.interface';
import type { TrackingResult } from '../../common/courier/tracking.model';
import { UpstreamError } from '../../common/errors/upstream.error';
import { ShalomWebClient } from './shalom-web.client';
import { CAPTCHA_PROVIDER, type CaptchaProvider } from './captcha/captcha.provider';
import { mapShalomAgency, mapShalomStatus } from './shalom.mapper';

@Injectable()
export class ShalomService implements CourierAdapter {
  readonly carrier = 'shalom' as const;
  private readonly logger = new Logger(ShalomService.name);

  constructor(
    private readonly web: ShalomWebClient,
    @Inject(CAPTCHA_PROVIDER) private readonly captcha: CaptchaProvider,
  ) {}

  /** Agencias: no requiere captcha. */
  async agencies(filter?: {
    q?: string;
    department?: string;
    province?: string;
  }): Promise<Agency[]> {
    const res = await this.web.post<{ data: Array<Record<string, any>> }>(
      'agencias/listar',
      {},
    );
    let result = (res?.data ?? []).map(mapShalomAgency);

    if (filter?.department) {
      const d = norm(filter.department);
      result = result.filter((a) => norm(a.department).includes(d));
    }
    if (filter?.province) {
      const p = norm(filter.province);
      result = result.filter((a) => norm(a.province).includes(p));
    }
    if (filter?.q) {
      const q = norm(filter.q);
      result = result.filter((a) =>
        norm(`${a.name} ${a.address} ${a.district} ${a.province} ${a.department}`).includes(q),
      );
    }
    return result;
  }

  /**
   * Estado por ose_id. Endpoint abierto (sin captcha).
   * ⚠️ Los ose_id son correlativos: usar SOLO ids que el cliente provea, nunca
   * enumerarlos. Ver docs/investigacion-upstreams.md §1.1 y §4.
   */
  async statusByOseId(oseId: string): Promise<TrackingResult> {
    const res = await this.web.post<{ message?: string; data?: Record<string, any> }>(
      'rastrea/estados',
      { ose_id: oseId },
    );
    return mapShalomStatus(oseId, res?.message, res?.data ?? null);
  }

  /**
   * Rastreo por guía + clave. Requiere resolver reCAPTCHA (action rastrea_buscar).
   * Con SHALOM_CAPTCHA_PROVIDER=none esto devuelve 501. `null` = Shalom no
   * tiene esa guía con esa clave.
   */
  async track(query: TrackQuery): Promise<TrackingResult | null> {
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
    if (!oseId) return null;

    const res = await this.web.post<{ message?: string; data?: Record<string, any> }>(
      'rastrea/estados',
      { ose_id: String(oseId) },
    );
    return mapShalomStatus(query.orderNumber, res?.message, res?.data ?? null, found.data);
  }
}

function norm(s: string | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
