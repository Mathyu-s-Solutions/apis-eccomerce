import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/configuration';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaApiKeyStore } from '../src/auth/prisma-api-key.store';
import { hashApiKey } from '../src/auth/api-key.hash';
import { QuotaExceededError } from '../src/auth/quota-exceeded.error';

/**
 * Store de Postgres contra una BD real con las migraciones aplicadas. Solo corre
 * con TEST_DATABASE_URL (nunca la de producción): p. ej. un Postgres en Docker
 * + `prisma migrate deploy`.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PrismaApiKeyStore (Postgres)', () => {
  const prisma = new PrismaService({ auth: { databaseUrl: url } } as unknown as AppConfig);
  const store = new PrismaApiKeyStore(prisma);
  const tag = `t${Date.now()}`;
  let userId = '';

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `${tag}@test.local` } });
    userId = user.id;
    await prisma.subscription.create({
      data: { userId, product: 'shalom', plan: 'basico', monthlyLimit: 3, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    await prisma.subscription.create({
      data: { userId, product: 'olva', plan: 'basico', monthlyLimit: 5000, expiresAt: new Date(Date.now() - 86_400_000) },
    });
    for (const [raw, product] of [[`${tag}-a`, 'shalom'], [`${tag}-b`, 'all']]) {
      await prisma.apiKey.create({
        data: { keyHash: hashApiKey(raw), prefix: raw.slice(0, 12), name: raw, product, monthlyLimit: 999, userId },
      });
    }
    await prisma.apiKey.create({
      data: { keyHash: hashApiKey(`${tag}-c`), prefix: 'c', name: 'sin dueño', monthlyLimit: 1 },
    });
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.apiKey.deleteMany({ where: { keyHash: hashApiKey(`${tag}-c`) } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('trae el producto, el dueño y sus planes', async () => {
    const rec = (await store.findByKey(`${tag}-a`))!;
    expect(rec).toMatchObject({ product: 'shalom', userId });
    expect(rec.plans.shalom).toMatchObject({ plan: 'basico', monthlyLimit: 3 });
  });

  it('las keys del cliente comparten la cuota del plan; la última unidad es atómica', async () => {
    const a = (await store.findByKey(`${tag}-a`))!;
    const b = (await store.findByKey(`${tag}-b`))!;
    // 5 llamadas a la vez contra una cuota de 3: pasan exactamente 3.
    const results = await Promise.allSettled([a, b, a, b, a].map((k) => store.consume(k, 1, 'shalom')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'rejected' && r.reason instanceof QuotaExceededError)).toHaveLength(2);
    expect(await store.usage(a, 'shalom')).toMatchObject({ used: 3, limit: 3, remaining: 0, plan: 'basico' });
    // El consumo de cada key queda contado aparte (informativo).
    const perKey = await prisma.usageCounter.findMany({ where: { apiKey: { userId } } });
    expect(perKey.reduce((s, c) => s + c.used, 0)).toBe(3);
  });

  it('refund devuelve al plan y a la key', async () => {
    const a = (await store.findByKey(`${tag}-a`))!;
    await store.refund(a, 1, 'shalom');
    expect((await store.usage(a, 'shalom')).used).toBe(2);
  });

  it('plan vencido = gratis; key sin dueño = su propio límite', async () => {
    const b = (await store.findByKey(`${tag}-b`))!;
    expect(await store.consume(b, 1, 'olva')).toMatchObject({ plan: 'free', limit: 100, used: 1 });
    const c = (await store.findByKey(`${tag}-c`))!;
    await store.consume(c, 1, 'olva');
    await expect(store.consume(c, 1, 'olva')).rejects.toBeInstanceOf(QuotaExceededError);
  });
});
