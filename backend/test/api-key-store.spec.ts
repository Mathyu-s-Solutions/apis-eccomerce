import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/configuration';
import { InMemoryApiKeyStore } from '../src/auth/in-memory-api-key.store';
import { apiKeyPrefix, generateApiKey, hashApiKey } from '../src/auth/api-key.hash';
import { QuotaExceededError } from '../src/auth/quota-exceeded.error';
import { FREE_MONTHLY_LIMIT } from '../src/auth/plan-quota';

function makeStore(auth: Partial<AppConfig['auth']>): InMemoryApiKeyStore {
  const config = {
    auth: { devApiKeyMonthlyLimit: 100, ...auth },
  } as unknown as AppConfig;
  const store = new InMemoryApiKeyStore(config);
  store.onModuleInit();
  return store;
}

describe('api-key.hash', () => {
  it('genera keys sk_live_ con 192 bits y hashea de forma determinista', () => {
    const k = generateApiKey();
    expect(k).toMatch(/^sk_live_[0-9a-f]{48}$/);
    expect(hashApiKey(k)).toBe(hashApiKey(k));
    expect(hashApiKey(k)).not.toContain(k);
    expect(apiKeyPrefix(k)).toBe(k.slice(0, 12));
  });
});

describe('InMemoryApiKeyStore', () => {
  it('encuentra la key por su valor en claro y nunca expone la key completa', async () => {
    const store = makeStore({ devApiKey: 'sk_test_abcdef123456' });
    const rec = await store.findByKey('sk_test_abcdef123456');
    expect(rec?.name).toBe('Desarrollo');
    expect(rec?.prefix).toBe('sk_test_abcd');
    expect(JSON.stringify(rec)).not.toContain('sk_test_abcdef123456');
    expect(await store.findByKey('otra-key')).toBeNull();
  });

  it('cobra hasta el límite y luego lanza 429', async () => {
    const store = makeStore({ devApiKey: 'k', devApiKeyMonthlyLimit: 2 });
    const rec = (await store.findByKey('k'))!;
    await store.consume(rec, 1);
    const u = await store.consume(rec, 1);
    expect(u).toMatchObject({ used: 2, limit: 2, remaining: 0 });
    await expect(store.consume(rec, 1)).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('refund devuelve unidades sin bajar de cero', async () => {
    const store = makeStore({ devApiKey: 'k', devApiKeyMonthlyLimit: 5 });
    const rec = (await store.findByKey('k'))!;
    await store.consume(rec, 2);
    await store.refund(rec, 1);
    expect((await store.usage(rec)).used).toBe(1);
    await store.refund(rec, 10);
    expect((await store.usage(rec)).used).toBe(0);
  });

  it('queda inerte si hay DATABASE_URL (manda el store de Prisma)', async () => {
    const store = makeStore({
      devApiKey: 'k',
      databaseUrl: 'postgresql://u:p@h/db',
    });
    expect(await store.findByKey('k')).toBeNull();
  });
});

describe('cuota por plan (keys con dueño)', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const seed = JSON.stringify([
    { key: 'shalom-1', product: 'shalom', userId: 'u1', monthlyLimit: 999, plans: { shalom: { plan: 'basico', monthlyLimit: 3, expiresAt: future } } },
    { key: 'shalom-2', product: 'shalom', userId: 'u1', monthlyLimit: 999 },
    { key: 'todas', product: 'all', userId: 'u1', plans: { shalom: { plan: 'basico', monthlyLimit: 3, expiresAt: future }, olva: { plan: 'basico', monthlyLimit: 5000, expiresAt: past } } },
    { key: 'sin-dueño', monthlyLimit: 1 },
  ]);

  it('las keys del mismo cliente comparten la cuota del plan de esa API', async () => {
    const store = makeStore({ apiKeysJson: seed });
    const a = (await store.findByKey('shalom-1'))!;
    const b = (await store.findByKey('shalom-1'))!;
    await store.consume(a, 2, 'shalom');
    const u = await store.consume(b, 1, 'shalom');
    expect(u).toMatchObject({ used: 3, limit: 3, remaining: 0, plan: 'basico' });
    // Otra key del mismo cliente: misma cuota, aunque su límite propio sea 999.
    const todas = (await store.findByKey('todas'))!;
    await expect(store.consume(todas, 1, 'shalom')).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('cada API tiene su plan; vencido o sin plan, rige el gratis', async () => {
    const store = makeStore({ apiKeysJson: seed });
    const todas = (await store.findByKey('todas'))!;
    // Olva venció ayer: plan gratis.
    expect(await store.consume(todas, 1, 'olva')).toMatchObject({ plan: 'free', limit: FREE_MONTHLY_LIMIT.olva, used: 1 });
    // SUNAT sin plan: gratis.
    expect(await store.usage(todas, 'sunat')).toMatchObject({ plan: 'free', limit: FREE_MONTHLY_LIMIT.sunat, used: 0 });
    // La key shalom-2 no trae planes propios en la semilla: sin plan = gratis.
    const otra = (await store.findByKey('shalom-2'))!;
    expect(await store.usage(otra, 'shalom')).toMatchObject({ plan: 'free', limit: FREE_MONTHLY_LIMIT.shalom });
  });

  it('una key sin dueño sigue usando su propio límite', async () => {
    const store = makeStore({ apiKeysJson: seed });
    const rec = (await store.findByKey('sin-dueño'))!;
    await store.consume(rec, 1, 'olva');
    await expect(store.consume(rec, 1, 'shalom')).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('refund devuelve al contador del plan', async () => {
    const store = makeStore({ apiKeysJson: seed });
    const rec = (await store.findByKey('shalom-1'))!;
    await store.consume(rec, 2, 'shalom');
    await store.refund(rec, 2, 'shalom');
    expect((await store.usage(rec, 'shalom')).used).toBe(0);
  });
});
