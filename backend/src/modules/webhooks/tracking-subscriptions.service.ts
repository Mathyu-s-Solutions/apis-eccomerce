import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { TrackingSubscription } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import type { ApiKeyRecord } from '../../auth/api-key.store';
import { quotaScope } from '../../auth/plan-quota';
import { ShipmentStatus, type TrackingResult } from '../../common/courier/tracking.model';
import { ShalomService } from '../shalom/shalom.service';
import { OlvaService } from '../olva/olva.service';
import { WebhooksService } from './webhooks.service';

export type Courier = 'shalom' | 'olva';

const MIN = 60_000;
/** Cada cuánto se revisa una guía según su estado. */
const CHECK_EVERY: Partial<Record<ShipmentStatus, number>> = {
  [ShipmentStatus.REGISTERED]: 120 * MIN,
  [ShipmentStatus.IN_TRANSIT]: 60 * MIN,
  [ShipmentStatus.AT_DESTINATION]: 30 * MIN,
  [ShipmentStatus.OUT_FOR_DELIVERY]: 30 * MIN,
  [ShipmentStatus.INCIDENT]: 60 * MIN,
};
const DEFAULT_EVERY = 120 * MIN;
/** Estados después de los cuales ya no hay nada que vigilar. */
const FINAL = new Set<ShipmentStatus>([ShipmentStatus.DELIVERED, ShipmentStatus.RETURNED]);
/** Se deja de vigilar una guía después de 60 días o 20 errores seguidos. */
const MAX_AGE_MS = 60 * 24 * 60 * MIN;
const MAX_FAILURES = 20;
/** Guías vigiladas a la vez por cuenta y API. */
export const MAX_ACTIVE = { free: 5, paid: 1000 };

/** Estado + último evento: si cambia, hay aviso. */
export function fingerprint(t: TrackingResult): string {
  const last = t.events.at(-1);
  return [t.status, t.events.length, last?.at ?? '', last?.rawStatus ?? ''].join('|');
}

export function nextCheck(status: ShipmentStatus, now = new Date()): Date {
  return new Date(now.getTime() + (CHECK_EVERY[status] ?? DEFAULT_EVERY));
}

/** Lo que va en el webhook: el seguimiento normalizado, sin la respuesta cruda. */
function eventData(courier: Courier, t: TrackingResult, previousStatus: string | null) {
  const { raw: _raw, ...tracking } = t;
  return { ...tracking, carrier: courier, previousStatus, lastEvent: t.events.at(-1) ?? null };
}

function view(s: TrackingSubscription) {
  return {
    id: s.id,
    carrier: s.product,
    orderNumber: s.orderNumber,
    status: s.status,
    active: s.active,
    lastCheckedAt: s.lastCheckedAt,
    nextCheckAt: s.active ? s.nextCheckAt : null,
    createdAt: s.createdAt,
  };
}

@Injectable()
export class TrackingSubscriptionsService {
  private readonly logger = new Logger(TrackingSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shalom: ShalomService,
    private readonly olva: OlvaService,
    private readonly webhooks: WebhooksService,
  ) {}

  /** Webhooks y suscripciones son de una cuenta del portal. */
  static ownerOf(record: ApiKeyRecord): string {
    if (!record.userId) {
      throw new ForbiddenException('Los webhooks son de una cuenta: usa una API key creada en tu panel.');
    }
    return record.userId;
  }

  async subscribe(record: ApiKeyRecord, courier: Courier, guide: { orderNumber: string; orderCode?: string }) {
    const userId = TrackingSubscriptionsService.ownerOf(record);
    const existing = await this.prisma.trackingSubscription.findUnique({
      where: { userId_product_orderNumber: { userId, product: courier, orderNumber: guide.orderNumber } },
    });
    if (!existing?.active) {
      const scope = quotaScope(record, courier);
      const max = scope.kind === 'plan' && scope.plan !== 'free' ? MAX_ACTIVE.paid : MAX_ACTIVE.free;
      const active = await this.prisma.trackingSubscription.count({ where: { userId, product: courier, active: true } });
      if (active >= max) {
        throw new ConflictException(`Ya vigilas ${active} guías de ${courier} (máximo ${max} con tu plan). Quita alguna o sube de plan.`);
      }
    }

    // Se valida la guía con el courier: en Shalom el ose_id (un captcha la primera vez, nunca la clave).
    let tracking: TrackingResult | null;
    let upstreamRef: string | null = null;
    if (courier === 'shalom') {
      const found = await this.shalom.resolveGuide(guide);
      if (!found) throw new NotFoundException('No se encontró la guía con esa clave en Shalom.');
      upstreamRef = found.oseId;
      tracking = await this.shalom.statusOf(found, guide.orderNumber);
    } else {
      tracking = await this.olva.track(guide);
      if (!tracking) throw new NotFoundException('No se encontró la guía en Olva con ese año de emisión.');
    }

    const now = new Date();
    const active = !FINAL.has(tracking.status);
    const data = {
      orderCode: courier === 'olva' ? (guide.orderCode ?? null) : null,
      upstreamRef,
      status: tracking.status,
      fingerprint: fingerprint(tracking),
      active,
      failures: 0,
      lastCheckedAt: now,
      nextCheckAt: nextCheck(tracking.status, now),
    };
    const sub = await this.prisma.trackingSubscription.upsert({
      where: { userId_product_orderNumber: { userId, product: courier, orderNumber: guide.orderNumber } },
      create: { userId, product: courier, orderNumber: guide.orderNumber, ...data },
      update: { ...data, createdAt: existing?.active ? undefined : now },
    });
    const { raw: _raw, ...current } = tracking;
    return { subscription: view(sub), tracking: current, ...(active ? {} : { message: 'La guía ya terminó: no hay cambios que vigilar.' }) };
  }

  async list(record: ApiKeyRecord, courier: Courier, includeInactive: boolean) {
    const userId = TrackingSubscriptionsService.ownerOf(record);
    const subs = await this.prisma.trackingSubscription.findMany({
      where: { userId, product: courier, ...(includeInactive ? {} : { active: true }) },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return subs.map(view);
  }

  async unsubscribe(record: ApiKeyRecord, courier: Courier, orderNumber: string) {
    const userId = TrackingSubscriptionsService.ownerOf(record);
    const { count } = await this.prisma.trackingSubscription.updateMany({
      where: { userId, product: courier, orderNumber, active: true },
      data: { active: false },
    });
    if (!count) throw new NotFoundException('No estás vigilando esa guía.');
    return { orderNumber, active: false };
  }

  /** El estado actual de una guía vigilada, sin captcha. */
  private current(s: TrackingSubscription): Promise<TrackingResult | null> {
    if (s.product === 'shalom') {
      if (!s.upstreamRef) return Promise.resolve(null);
      return this.shalom.statusByOseId(s.upstreamRef, s.orderNumber);
    }
    return this.olva.track({ orderNumber: s.orderNumber, orderCode: s.orderCode ?? undefined });
  }

  /**
   * Revisa las guías que tocan (reservadas con SKIP LOCKED) y encola un aviso
   * por cada cambio. Lo llama el worker.
   */
  async pollDue(limit = 100, concurrency = 5, now = new Date()): Promise<{ checked: number; changed: number; errors: number }> {
    // Las fechas las escribe la app: se comparan con su reloj, no con el de Postgres.
    const due = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "tracking_subscriptions" SET "next_check_at" = ${new Date(now.getTime() + 10 * 60_000)}
       WHERE "id" IN (
         SELECT "id" FROM "tracking_subscriptions"
          WHERE "active" AND "next_check_at" <= ${now}
          ORDER BY "next_check_at" LIMIT ${limit}
          FOR UPDATE SKIP LOCKED)
      RETURNING "id"`;
    const stats = { checked: 0, changed: 0, errors: 0 };
    let i = 0;
    const lane = async () => {
      while (i < due.length) {
        const { id } = due[i++];
        const r = await this.check(id, now);
        stats.checked++;
        if (r === 'changed') stats.changed++;
        if (r === 'error') stats.errors++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, due.length) }, lane));
    return stats;
  }

  async check(id: string, now = new Date()): Promise<'changed' | 'same' | 'error'> {
    const s = await this.prisma.trackingSubscription.findUniqueOrThrow({ where: { id } });
    let tracking: TrackingResult | null;
    try {
      tracking = await this.current(s);
      if (!tracking) throw new Error('El courier ya no encuentra la guía.');
    } catch (err) {
      const failures = s.failures + 1;
      await this.prisma.trackingSubscription.update({
        where: { id },
        data: {
          failures,
          active: failures < MAX_FAILURES,
          lastCheckedAt: now,
          nextCheckAt: new Date(now.getTime() + Math.min(6 * 60 * MIN, 15 * MIN * 2 ** Math.min(failures, 5))),
        },
      });
      this.logger.warn(`Guía ${s.product} ${id}: ${err instanceof Error ? err.message : String(err)}`);
      return 'error';
    }

    const fp = fingerprint(tracking);
    const changed = fp !== s.fingerprint;
    const expired = now.getTime() - s.createdAt.getTime() > MAX_AGE_MS;
    await this.prisma.trackingSubscription.update({
      where: { id },
      data: {
        status: tracking.status,
        fingerprint: fp,
        failures: 0,
        active: !FINAL.has(tracking.status) && !expired,
        lastCheckedAt: now,
        nextCheckAt: nextCheck(tracking.status, now),
      },
    });
    if (changed) {
      await this.webhooks.enqueue(s.userId, 'tracking.updated', eventData(s.product as Courier, tracking, s.status), s.id);
    }
    return changed ? 'changed' : 'same';
  }
}
