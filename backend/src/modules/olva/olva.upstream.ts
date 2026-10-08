import { Inject, Injectable } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { HttpClientService } from '../../common/http/http-client.service';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export interface OlvaStore {
  office_id: string;
  nombres: string;
  tipo: string;
  ubigeo: string;
  partner: string;
  direccion: string;
  lat: string;
  lng: string;
  department: string;
  province: string;
  district: string;
  horario?: unknown;
  office_type?: string;
}

/**
 * Llamadas a los endpoints públicos de las webs de Olva.
 * Referencia: docs/investigacion-upstreams.md §2. Todos verificados 2026-10-08.
 */
@Injectable()
export class OlvaUpstream {
  private readonly UPSTREAM = 'olva';

  constructor(
    private readonly http: HttpClientService,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
  ) {}

  private wpHeaders(referer: string): Record<string, string> {
    return {
      'user-agent': UA,
      origin: this.config.olva.wpBase,
      referer: `${this.config.olva.wpBase}/${referer}`,
      accept: 'application/json, text/plain, */*',
    };
  }

  /** Tracking vía reports.olvaexpress.pe (apikey pública embebida en su front). */
  async getTrackingInformation(
    tracking: string,
    emision: string | undefined,
  ): Promise<unknown> {
    const res = await this.http.request<unknown>(
      `${this.config.olva.trackingBase}/webservice/rest/getTrackingInformation`,
      {
        upstream: this.UPSTREAM,
        query: {
          tracking,
          emision: emision ?? '',
          apikey: this.config.olva.trackingApiKey,
          details: 1,
        },
        headers: {
          'user-agent': UA,
          origin: 'https://tracking.olvaexpress.pe',
          referer: 'https://tracking.olvaexpress.pe/',
        },
      },
    );
    return res.data;
  }

  /** Agencias/tiendas (WordPress admin-ajax, sin auth). */
  async getStores(): Promise<OlvaStore[]> {
    // Forma real: { success, data: { data: [...stores], from_cache } }
    const res = await this.http.request<{
      success: boolean;
      data: { data: OlvaStore[]; from_cache?: boolean };
    }>(`${this.config.olva.wpBase}/wp-admin/admin-ajax.php`, {
      upstream: this.UPSTREAM,
      query: { action: 'get_olva_stores' },
      headers: this.wpHeaders('ubicanos/'),
    });
    return res.data?.data?.data ?? [];
  }

  /** Catálogo de ubigeos (WordPress admin-ajax, sin auth). */
  async getUbigeos(): Promise<unknown[]> {
    const res = await this.http.request<{
      success: boolean;
      data: { data: unknown[] };
    }>(`${this.config.olva.wpBase}/wp-admin/admin-ajax.php`, {
      upstream: this.UPSTREAM,
      query: { action: 'olva_get_ubigeos' },
      headers: this.wpHeaders('cotizar/'),
    });
    return res.data?.data?.data ?? [];
  }

  /** Cotización (WordPress admin-ajax, multipart, sin auth). */
  async calculateShipping(params: {
    partnerRate: boolean;
    originUbigeo: string;
    destinyUbigeo: string;
    deliveryType: 'D' | 'O';
    shipmentType: 1 | 2;
    weight: number;
    length?: number;
    width?: number;
    height?: number;
  }): Promise<{ status: boolean; amount: string; excess_weight?: number; delivery_type?: string }> {
    const form = new FormData();
    form.append('action', 'olva_calculate_shipping');
    form.append('partner_rate', String(params.partnerRate));
    form.append('ubigeo_code_origin', params.originUbigeo);
    form.append('ubigeo_code_destiny', params.destinyUbigeo);
    form.append('delivery_type', params.deliveryType);
    form.append('shipment_type', String(params.shipmentType));
    form.append('weight', String(params.weight));
    form.append('length', params.length != null ? String(params.length) : '');
    form.append('width', params.width != null ? String(params.width) : '');
    form.append('height', params.height != null ? String(params.height) : '');

    const res = await this.http.request<{
      success: boolean;
      data: { status: boolean; amount: string; excess_weight?: number; delivery_type?: string };
    }>(`${this.config.olva.wpBase}/wp-admin/admin-ajax.php`, {
      upstream: this.UPSTREAM,
      method: 'POST',
      body: form,
      headers: this.wpHeaders('cotizar/'),
    });
    return res.data?.data;
  }
}
