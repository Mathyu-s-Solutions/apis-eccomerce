import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  Agency,
  CourierAdapter,
  TrackQuery,
} from '../../common/courier/courier-adapter.interface';
import type { TrackingResult } from '../../common/courier/tracking.model';
import { OlvaUpstream } from './olva.upstream';
import { mapStore, mapTracking } from './olva.mapper';
import type { OlvaQuoteDto } from './dto/olva.dto';

@Injectable()
export class OlvaService implements CourierAdapter {
  readonly carrier = 'olva' as const;

  constructor(private readonly upstream: OlvaUpstream) {}

  async track(query: TrackQuery): Promise<TrackingResult> {
    const raw = await this.upstream.getTrackingInformation(
      query.orderNumber,
      query.orderCode,
    );
    return mapTracking(query.orderNumber, raw);
  }

  async trackBatch(queries: TrackQuery[]): Promise<TrackingResult[]> {
    // Olva no tiene batch nativo; paralelizamos con límite implícito del pool.
    return Promise.all(queries.map((q) => this.track(q)));
  }

  async agencies(filter?: {
    q?: string;
    department?: string;
    province?: string;
  }): Promise<Agency[]> {
    const stores = await this.upstream.getStores();
    let result = stores.map(mapStore);

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

  async ubigeos(): Promise<unknown[]> {
    return this.upstream.getUbigeos();
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

function norm(s: string | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
