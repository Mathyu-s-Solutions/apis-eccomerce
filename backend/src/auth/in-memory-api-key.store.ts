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
import { quotaScope } from './plan-quota';
import type { Product } from './product.decorator';
import { QuotaExceededError } from './quota-exceeded.error';

/** Key de API_KEYS (JSON). `userId` y `plans` permiten probar las cuotas por plan. */
interface SeedKey {
  key: string;
  name?: string;
  monthlyLimit?: number | null;
  product?: string;
  userId?: string;
  plans?: Partial<Record<Product, { plan: string; monthlyLimit: number | null; expiresAt?: string | null }>>;
}

/**
 * Store en memoria: se usa cuando no hay DATABASE_URL (desarrollo/tests).
 * No sirve con varias instancias ni sobrevive a reinicios.
 */
@Injectable()
export class InMemoryApiKeyStore extends ApiKeyStore implements OnModuleInit {
  private readonly logger = new Logger(InMemoryApiKeyStore.name);
  private readonly byHash = new Map<string, ApiKeyRecord>();
  // `key:<id>:<period>` o `plan:<userId>:<product>:<period>` -> usado
  private readonly counters = new Map<string, number>();
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
        const parsed = JSON.parse(apiKeysJson) as SeedKey[];
        parsed.forEach((k, i) => this.add(k, `key_${i + 1}`));
      } catch (err) {
        this.logger.error(`API_KEYS no es JSON válido: ${String(err)}`);
      }
    }
    if (devApiKey) {
      this.add({ key: devApiKey, name: 'Desarrollo', monthlyLimit: devApiKeyMonthlyLimit }, 'dev');
      this.logger.warn('API key de desarrollo activa (store en memoria). No usar en producción.');
    }
    if (this.byHash.size === 0) {
      this.logger.warn('No hay API keys configuradas. Define DEV_API_KEY, API_KEYS o DATABASE_URL.');
    }
  }

  private add(k: SeedKey, id: string): void {
    const plans: ApiKeyRecord['plans'] = {};
    for (const [product, grant] of Object.entries(k.plans ?? {})) {
      if (!grant) continue;
      plans[product as Product] = {
        plan: grant.plan,
        monthlyLimit: grant.monthlyLimit,
        expiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null,
      };
    }
    this.byHash.set(hashApiKey(k.key), {
      id,
      prefix: apiKeyPrefix(k.key),
      name: k.name ?? `Cliente ${id}`,
      monthlyLimit: k.monthlyLimit ?? null,
      enabled: true,
      product: k.product ?? 'all',
      userId: k.userId ?? null,
      plans,
    });
  }

  async findByKey(rawKey: string): Promise<ApiKeyRecord | null> {
    const rec = this.byHash.get(hashApiKey(rawKey));
    return rec && rec.enabled ? rec : null;
  }

  /** Contador del que sale la cuota, y su límite. */
  private counter(record: ApiKeyRecord, product: Product | undefined) {
    const period = currentPeriod();
    const scope = quotaScope(record, product);
    const key =
      scope.kind === 'plan'
        ? `plan:${scope.userId}:${scope.product}:${period}`
        : `key:${record.id}:${period}`;
    return { period, key, limit: scope.limit, plan: scope.kind === 'plan' ? scope.plan : undefined };
  }

  async usage(record: ApiKeyRecord, product?: Product): Promise<ApiKeyUsage> {
    const c = this.counter(record, product);
    return toUsage(c.limit, c.period, this.counters.get(c.key) ?? 0, c.plan);
  }

  async consume(record: ApiKeyRecord, units: number, product?: Product): Promise<ApiKeyUsage> {
    const c = this.counter(record, product);
    const next = (this.counters.get(c.key) ?? 0) + units;
    if (c.limit !== null && next > c.limit) {
      throw new QuotaExceededError(c.limit, c.period);
    }
    this.counters.set(c.key, next);
    return toUsage(c.limit, c.period, next, c.plan);
  }

  async refund(record: ApiKeyRecord, units: number, product?: Product): Promise<void> {
    const c = this.counter(record, product);
    this.counters.set(c.key, Math.max(0, (this.counters.get(c.key) ?? 0) - units));
  }
}
