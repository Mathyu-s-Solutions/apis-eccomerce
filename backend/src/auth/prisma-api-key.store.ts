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
import { QuotaExceededError } from './quota-exceeded.error';

/**
 * Store en Postgres (Neon) vía Prisma.
 *
 * Cuota atómica: un único `UPDATE ... WHERE used + n <= limit RETURNING used`.
 * Si dos requests compiten por la última unidad, Postgres serializa la fila y
 * solo una pasa; la otra no actualiza ninguna fila y recibe 429. Correcto con
 * varias instancias de la API.
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
    });
    if (!row || !row.enabled) return null;
    return {
      id: row.id,
      prefix: row.prefix,
      name: row.name,
      monthlyLimit: row.monthlyLimit,
      enabled: row.enabled,
    };
  }

  async usage(record: ApiKeyRecord): Promise<ApiKeyUsage> {
    const period = currentPeriod();
    const row = await this.prisma.usageCounter.findUnique({
      where: { apiKeyId_period: { apiKeyId: record.id, period } },
    });
    return toUsage(record, period, row?.used ?? 0);
  }

  async consume(record: ApiKeyRecord, units: number): Promise<ApiKeyUsage> {
    const period = currentPeriod();

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
         AND (${record.monthlyLimit}::int IS NULL
              OR "used" + ${units}::int <= ${record.monthlyLimit}::int)
      RETURNING "used"`;

    if (rows.length === 0) {
      throw new QuotaExceededError(record.monthlyLimit ?? 0, period);
    }
    return toUsage(record, period, rows[0].used);
  }

  async refund(record: ApiKeyRecord, units: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "usage_counters"
         SET "used" = GREATEST("used" - ${units}::int, 0)
       WHERE "api_key_id" = ${record.id}
         AND "period" = ${currentPeriod()}`;
  }
}
