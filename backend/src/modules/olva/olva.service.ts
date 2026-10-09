import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  Agency,
  CourierAdapter,
  Place,
  TrackQuery,
} from '../../common/courier/courier-adapter.interface';
import type { TrackingResult } from '../../common/courier/tracking.model';
import { TtlCache } from '../../common/cache/ttl-cache';
import { filterAgencies } from '../../common/courier/agency-search';
import { PlaceTree } from '../../common/courier/locations';
import { OlvaUpstream } from './olva.upstream';
import { mapStore, mapTracking } from './olva.mapper';
import type { OlvaQuoteDto } from './dto/olva.dto';

@Injectable()
export class OlvaService implements CourierAdapter {
  readonly carrier = 'olva' as const;
  // Catálogos: cambian poco y los piden los endpoints gratuitos.
  private readonly storesCache = new TtlCache<Agency[]>(6 * 60 * 60 * 1000);
  private readonly ubigeosCache = new TtlCache<{ rows: unknown[]; tree: PlaceTree }>(24 * 60 * 60 * 1000);
  // Un minuto: el que consulta seguido la misma guía no le pega a Olva cada vez.
  private readonly trackCache = new TtlCache<Record<string, any> | null>(60_000);

  constructor(private readonly upstream: OlvaUpstream) {}

  /** `null` = Olva no tiene esa guía (con ese año de emisión). */
  async track(query: TrackQuery): Promise<TrackingResult | null> {
    const raw = await this.trackCache.get(`${query.orderNumber}:${query.orderCode ?? ''}`, () =>
      this.upstream.getTrackingInformation(query.orderNumber, query.orderCode),
    );
    return raw ? mapTracking(query.orderNumber, raw) : null;
  }

  /** En el mismo orden que `queries`; `null` en las guías que Olva no tiene. */
  async trackBatch(queries: TrackQuery[]): Promise<Array<TrackingResult | null>> {
    // Olva no tiene batch nativo; paralelizamos con límite implícito del pool.
    return Promise.all(queries.map((q) => this.track(q)));
  }

  /** Todas las agencias (con caché de 6 h). */
  allAgencies(): Promise<Agency[]> {
    return this.storesCache.get('all', async () => (await this.upstream.getStores()).map(mapStore), (l) => l.length > 0);
  }

  async agencies(filter: { q?: string; department?: string; province?: string; district?: string } = {}): Promise<Agency[]> {
    return filterAgencies(await this.allAgencies(), filter);
  }

  private catalog() {
    return this.ubigeosCache.get(
      'all',
      async () => {
        const rows = await this.upstream.getUbigeos();
        const tree = new PlaceTree(
          (rows as Array<Record<string, unknown>>).map((r) => ({
            ubigeo: String(r.ubigeo_code ?? ''),
            department: String(r.department ?? ''),
            province: String(r.province ?? ''),
            district: String(r.district ?? ''),
          })),
        );
        return { rows, tree };
      },
      (c) => c.rows.length > 0,
    );
  }

  async ubigeos(): Promise<unknown[]> {
    return (await this.catalog()).rows;
  }

  async departments(): Promise<Place[]> {
    return (await this.catalog()).tree.departments();
  }

  async provinces(department: string): Promise<Place[] | null> {
    return (await this.catalog()).tree.provinces(department);
  }

  async districts(department: string, province: string): Promise<Place[] | null> {
    return (await this.catalog()).tree.districts(department, province);
  }

  async quote(dto: OlvaQuoteDto): Promise<{
    origin: string;
    destination: string;
    deliveryType: string;
    amount: number;
    currency: 'PEN';
    excessWeight?: number;
    raw: unknown;
  }> {
    if (dto.shipmentType === 2 && (!dto.length || !dto.width || !dto.height)) {
      throw new BadRequestException(
        'Para shipmentType=2 (paquete) se requieren length, width y height.',
      );
    }
    const res = await this.upstream.calculateShipping({
      partnerRate: dto.partnerRate,
      originUbigeo: dto.origin,
      destinyUbigeo: dto.destination,
      deliveryType: dto.deliveryType,
      shipmentType: dto.shipmentType as 1 | 2,
      weight: dto.weight,
      length: dto.length,
      width: dto.width,
      height: dto.height,
    });

    if (!res?.status || Number.isNaN(parseFloat(res?.amount))) {
      throw new BadRequestException(
        'Olva no pudo cotizar con esos datos (ubigeo/peso/dimensiones).',
      );
    }

    return {
      origin: dto.origin,
      destination: dto.destination,
      deliveryType: res.delivery_type ?? dto.deliveryType,
      amount: Number(parseFloat(res.amount).toFixed(2)),
      currency: 'PEN',
      excessWeight: res.excess_weight,
      raw: res,
    };
  }
}
