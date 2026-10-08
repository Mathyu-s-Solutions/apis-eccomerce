import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  type ApiKeyRecord,
  ApiKeyStore,
  type ApiKeyUsage,
  currentPeriod,
  toUsage,
} from './api-key.store';
import { hashApiKey } from './api-key.hash';
import { quotaScope } from './plan-quota';
import { PRODUCTS, type Product } from './product.decorator';
import { QuotaExceededError } from './quota-exceeded.error';

/**
 * Store en Postgres (Neon) vía Prisma.
 *
 * Cuota atómica en una sola sentencia: `... WHERE used + n <= limit RETURNING used`.
 * Si dos requests compiten por la última unidad, Postgres serializa la fila y
 * solo una pasa; la otra no actualiza ninguna fila y recibe 429. Correcto con
 * varias instancias de la API.
 *
 * Keys con dueño: la cuota es la del plan del cliente para esa API
 * (`plan_usage`, compartida por todas sus keys); `usage_counters` sigue
 * contando por key para mostrar el consumo de cada una en el portal.
 */
@Injectable()
export class PrismaApiKeyStore extends ApiKeyStore {
  // A propósito NO siembra DEV_API_KEY: una key de desarrollo guardada en la BD
  // compartida quedaría válida en producción. Las keys reales se crean con
  // `pnpm key:create`. DEV_API_KEY solo aplica al store en memoria.
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByKey(rawKey: string): Promise<ApiKeyRecord | null> {
    const row = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(rawKey) },
      include: { user: { select: { subscriptions: true } } },
    });
    if (!row || !row.enabled) return null;
    const plans: ApiKeyRecord['plans'] = {};
    for (const s of row.user?.subscriptions ?? []) {
      if ((PRODUCTS as readonly string[]).includes(s.product)) {
        plans[s.product as Product] = { plan: s.plan, monthlyLimit: s.monthlyLimit, expiresAt: s.expiresAt };
      }
    }
    return {
      id: row.id,
      prefix: row.prefix,
      name: row.name,
      monthlyLimit: row.monthlyLimit,
      enabled: row.enabled,
      product: row.product,
      userId: row.userId,
      plans,
    };
  }

  async usage(record: ApiKeyRecord, product?: Product): Promise<ApiKeyUsage> {
    const period = currentPeriod();
    const scope = quotaScope(record, product);
    if (scope.kind === 'plan') {
      const row = await this.prisma.planUsage.findUnique({
        where: { userId_product_period: { userId: scope.userId, product: scope.product, period } },
      });
      return toUsage(scope.limit, period, row?.used ?? 0, scope.plan);
    }
    const row = await this.prisma.usageCounter.findUnique({
      where: { apiKeyId_period: { apiKeyId: record.id, period } },
    });
    return toUsage(scope.limit, period, row?.used ?? 0);
  }

  async consume(record: ApiKeyRecord, units: number, product?: Product): Promise<ApiKeyUsage> {
    const period = currentPeriod();
    const scope = quotaScope(record, product);

    if (scope.kind === 'plan') {
      const { userId, limit } = scope;
      const rows = await this.prisma.$queryRaw<Array<{ used: number }>>`
        INSERT INTO "plan_usage" ("user_id", "product", "period", "used")
        SELECT ${userId}::text, ${scope.product}::text, ${period}::text, ${units}::int
         WHERE ${limit}::int IS NULL OR ${units}::int <= ${limit}::int
        ON CONFLICT ("user_id", "product", "period") DO UPDATE
           SET "used" = "plan_usage"."used" + EXCLUDED."used"
         WHERE ${limit}::int IS NULL OR "plan_usage"."used" + EXCLUDED."used" <= ${limit}::int
        RETURNING "used"`;
      if (rows.length === 0) throw new QuotaExceededError(limit ?? 0, period);
      await this.countKey(record.id, period, units);
      return toUsage(limit, period, rows[0].used, scope.plan);
    }

    // Asegura que exista la fila del periodo (idempotente).
    await this.prisma.usageCounter.upsert({
      where: { apiKeyId_period: { apiKeyId: record.id, period } },
      create: { apiKeyId: record.id, period, used: 0 },
      update: {},
    });

    const rows = await this.prisma.$queryRaw<Array<{ used: number }>>`
      UPDATE "usage_counters"
         SET "used" = "used" + ${units}::int
       WHERE "api_key_id" = ${record.id}
         AND "period" = ${period}
         AND (${scope.limit}::int IS NULL
              OR "used" + ${units}::int <= ${scope.limit}::int)
      RETURNING "used"`;

    if (rows.length === 0) {
      throw new QuotaExceededError(scope.limit ?? 0, period);
    }
    return toUsage(scope.limit, period, rows[0].used);
  }

  async refund(record: ApiKeyRecord, units: number, product?: Product): Promise<void> {
    const period = currentPeriod();
    const scope = quotaScope(record, product);
    if (scope.kind === 'plan') {
      await this.prisma.$executeRaw`
        UPDATE "plan_usage"
           SET "used" = GREATEST("used" - ${units}::int, 0)
         WHERE "user_id" = ${scope.userId}
           AND "product" = ${scope.product}
           AND "period" = ${period}`;
    }
    await this.prisma.$executeRaw`
      UPDATE "usage_counters"
         SET "used" = GREATEST("used" - ${units}::int, 0)
       WHERE "api_key_id" = ${record.id}
         AND "period" = ${period}`;
  }

  /** Consumo de cada key (solo informativo cuando la cuota es del plan). */
  private async countKey(apiKeyId: string, period: string, units: number): Promise<void> {
    await this.prisma.usageCounter.upsert({
      where: { apiKeyId_period: { apiKeyId, period } },
      create: { apiKeyId, period, used: units },
      update: { used: { increment: units } },
    });
  }
}
