import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../config/configuration';
import {
  type ApiKeyRecord,
  ApiKeyStore,
  type ApiKeyUsage,
  currentPeriod,
  toUsage,
} from './api-key.store';
import { apiKeyPrefix, hashApiKey } from './api-key.hash';
import { QuotaExceededError } from './quota-exceeded.error';

/**
 * Store en memoria: se usa cuando no hay DATABASE_URL (desarrollo/tests).
 * No sirve con varias instancias ni sobrevive a reinicios.
 */
@Injectable()
export class InMemoryApiKeyStore extends ApiKeyStore implements OnModuleInit {
  private readonly logger = new Logger(InMemoryApiKeyStore.name);
  private readonly byHash = new Map<string, ApiKeyRecord>();
  private readonly counters = new Map<string, number>(); // `${id}:${period}` -> used
  private initialized = false; // ver nota en PrismaApiKeyStore.onModuleInit

  constructor(@Inject(CONFIG_TOKEN) private readonly config: AppConfig) {
    super();
  }

  onModuleInit(): void {
    // Si hay BD, el store activo es el de Prisma y este queda inerte.
    if (this.initialized || this.config.auth.databaseUrl) return;
    this.initialized = true;
    this.seed();
  }

  private seed(): void {
    const { apiKeysJson, devApiKey, devApiKeyMonthlyLimit } = this.config.auth;
    if (apiKeysJson) {
      try {
        const parsed = JSON.parse(apiKeysJson) as Array<{
          key: string;
          name?: string;
          monthlyLimit?: number | null;
        }>;
        parsed.forEach((k, i) =>
          this.add(k.key, `key_${i + 1}`, k.name ?? `Cliente ${i + 1}`, k.monthlyLimit ?? null),
        );
      } catch (err) {
        this.logger.error(`API_KEYS no es JSON válido: ${String(err)}`);
      }
    }
    if (devApiKey) {
      this.add(devApiKey, 'dev', 'Desarrollo', devApiKeyMonthlyLimit);
      this.logger.warn('API key de desarrollo activa (store en memoria). No usar en producción.');
    }
    if (this.byHash.size === 0) {
      this.logger.warn('No hay API keys configuradas. Define DEV_API_KEY, API_KEYS o DATABASE_URL.');
    }
  }

  private add(raw: string, id: string, name: string, monthlyLimit: number | null): void {
    this.byHash.set(hashApiKey(raw), {
      id,
      prefix: apiKeyPrefix(raw),
      name,
      monthlyLimit,
      enabled: true,
    });
  }

  async findByKey(rawKey: string): Promise<ApiKeyRecord | null> {
    const rec = this.byHash.get(hashApiKey(rawKey));
    return rec && rec.enabled ? rec : null;
  }

  async usage(record: ApiKeyRecord): Promise<ApiKeyUsage> {
    const period = currentPeriod();
    return toUsage(record, period, this.counters.get(`${record.id}:${period}`) ?? 0);
  }

  async consume(record: ApiKeyRecord, units: number): Promise<ApiKeyUsage> {
    const period = currentPeriod();
    const k = `${record.id}:${period}`;
    const next = (this.counters.get(k) ?? 0) + units;
    if (record.monthlyLimit !== null && next > record.monthlyLimit) {
      throw new QuotaExceededError(record.monthlyLimit, period);
    }
    this.counters.set(k, next);
    return toUsage(record, period, next);
  }

  async refund(record: ApiKeyRecord, units: number): Promise<void> {
    const k = `${record.id}:${currentPeriod()}`;
    this.counters.set(k, Math.max(0, (this.counters.get(k) ?? 0) - units));
  }
}
