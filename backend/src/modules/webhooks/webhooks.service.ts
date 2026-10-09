import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { checkWebhookUrl } from './url-guard';
import { newWebhookSecret, signWebhook, WebhookSender } from './webhook-sender';

/** Esperas entre reintentos; después del último, la entrega queda "dead" (se puede reenviar). */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 12 * 3600_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export type WebhookEvent = 'tracking.updated' | 'webhook.test';

const hint = (secret: string) => `${secret.slice(0, 12)}…${secret.slice(-4)}`;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: WebhookSender,
  ) {}

  async getConfig(userId: string) {
    const w = await this.prisma.webhook.findUnique({ where: { userId } });
    return w ? { url: w.url, enabled: w.enabled, secretHint: hint(w.secret), updatedAt: w.updatedAt } : null;
  }

  /**
   * Guarda la URL. La primera vez, o con `rotateSecret`, genera el secreto y lo
   * devuelve completo: es la única vez que se ve.
   */
  async setConfig(userId: string, input: { url: string; enabled?: boolean; rotateSecret?: boolean }) {
    const url = checkWebhookUrl(input.url).toString();
    const current = await this.prisma.webhook.findUnique({ where: { userId } });
    const secret = !current || input.rotateSecret ? newWebhookSecret() : current.secret;
    const w = await this.prisma.webhook.upsert({
      where: { userId },
      create: { userId, url, secret, enabled: input.enabled ?? true },
      update: { url, secret, enabled: input.enabled ?? current?.enabled ?? true },
    });
    return {
      url: w.url,
      enabled: w.enabled,
      secretHint: hint(w.secret),
      ...(secret !== current?.secret ? { secret: w.secret } : {}),
    };
  }

  async remove(userId: string): Promise<boolean> {
    const { count } = await this.prisma.webhook.deleteMany({ where: { userId } });
    return count > 0;
  }

  async deliveries(userId: string, page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.webhookDelivery.count({ where: { userId } }),
    ]);
    return {
      page,
      limit,
      total,
      items: items.map((d) => ({
        id: d.id,
        event: d.event,
        status: d.status,
        attempts: d.attempts,
        lastStatus: d.lastStatus,
        lastError: d.lastError,
        createdAt: d.createdAt,
        deliveredAt: d.deliveredAt,
        nextAttemptAt: d.status === 'pending' ? d.nextAttemptAt : null,
        payload: d.payload,
      })),
    };
  }

  /** Encola un aviso si la cuenta tiene un webhook activo. */
  async enqueue(userId: string, event: WebhookEvent, data: object, subscriptionId?: string) {
    const w = await this.prisma.webhook.findUnique({ where: { userId } });
    if (!w?.enabled) return null;
    return this.prisma.webhookDelivery.create({
      data: { userId, event, subscriptionId: subscriptionId ?? null, payload: data as object, nextAttemptAt: new Date() },
    });
  }

  /** Manda un evento de prueba ahora mismo. */
  async test(userId: string) {
    const w = await this.prisma.webhook.findUnique({ where: { userId } });
    if (!w) throw new NotFoundException('Primero configura la URL del webhook (PUT /v1/webhooks).');
    const d = await this.prisma.webhookDelivery.create({
      data: { userId, event: 'webhook.test', payload: { message: 'Webhook de prueba de Mathyu\'s APIs' } },
    });
    return this.dispatchOne(d.id);
  }

  /** Reenvía una entrega (también las "dead"): se intenta ahora mismo. */
  async redeliver(userId: string, id: string) {
    const { count } = await this.prisma.webhookDelivery.updateMany({
      where: { id, userId },
      data: { status: 'pending', nextAttemptAt: new Date(), attempts: 0 },
    });
    if (!count) throw new NotFoundException('No existe esa entrega.');
    return this.dispatchOne(id);
  }

  /**
   * Entregas pendientes que ya tocan. Se reservan con FOR UPDATE SKIP LOCKED,
   * así dos ticks del worker a la vez no mandan la misma.
   */
  async dispatchDue(limit = 100, now = new Date()): Promise<{ delivered: number; failed: number }> {
    // Las fechas las escribe la app: se comparan con su reloj, no con el de Postgres.
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "webhook_deliveries" SET "next_attempt_at" = ${new Date(now.getTime() + 5 * 60_000)}
       WHERE "id" IN (
         SELECT "id" FROM "webhook_deliveries"
          WHERE "status" = 'pending' AND "next_attempt_at" <= ${now}
          ORDER BY "next_attempt_at" LIMIT ${limit}
          FOR UPDATE SKIP LOCKED)
      RETURNING "id"`;
    // De a 5 a la vez: un receptor lento (10 s de timeout) no frena a los demás.
    let delivered = 0;
    let failed = 0;
    let i = 0;
    const lane = async () => {
      while (i < rows.length) {
        const r = await this.dispatchOne(rows[i++].id);
        if (r.status === 'delivered') delivered++;
        else failed++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, rows.length) }, lane));
    return { delivered, failed };
  }

  /** Un intento de entrega: firma, manda y deja el resultado (y el próximo intento). */
  async dispatchOne(id: string) {
    const d = await this.prisma.webhookDelivery.findUniqueOrThrow({ where: { id } });
    const w = await this.prisma.webhook.findUnique({ where: { userId: d.userId } });
    const attempts = d.attempts + 1;

    if (!w?.enabled) {
      return this.finish(id, { status: 'dead', attempts, lastError: 'El webhook está desactivado o se borró.' });
    }

    const body = JSON.stringify({ id: d.id, type: d.event, createdAt: d.createdAt.toISOString(), data: d.payload });
    const timestamp = Math.floor(Date.now() / 1000);
    try {
      const { status } = await this.sender.send(w.url, body, {
        'user-agent': "MathyuAPIs-Webhooks/1.0",
        'x-mathyu-event': d.event,
        'x-mathyu-delivery': d.id,
        'x-mathyu-signature': signWebhook(w.secret, timestamp, body),
      });
      if (status >= 200 && status < 300) {
        return this.finish(id, { status: 'delivered', attempts, lastStatus: status, lastError: null, deliveredAt: new Date() });
      }
      return this.retryOrDie(id, attempts, status, `Respondió ${status}`);
    } catch (err) {
      return this.retryOrDie(id, attempts, null, err instanceof Error ? err.message : String(err));
    }
  }

  private retryOrDie(id: string, attempts: number, lastStatus: number | null, lastError: string) {
    const dead = attempts >= MAX_ATTEMPTS;
    return this.finish(id, {
      status: dead ? 'dead' : 'pending',
      attempts,
      lastStatus,
      lastError: lastError.slice(0, 300),
      ...(dead ? {} : { nextAttemptAt: new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]) }),
    });
  }

  private async finish(
    id: string,
    data: { status: string; attempts: number; lastStatus?: number | null; lastError?: string | null; deliveredAt?: Date; nextAttemptAt?: Date },
  ) {
    const d = await this.prisma.webhookDelivery.update({ where: { id }, data });
    if (d.status === 'dead') this.logger.warn(`Webhook ${id} sin entregar tras ${d.attempts} intentos: ${d.lastError}`);
    return { id: d.id, status: d.status, attempts: d.attempts, lastStatus: d.lastStatus, lastError: d.lastError, nextAttemptAt: d.status === 'pending' ? d.nextAttemptAt : null };
  }
}
