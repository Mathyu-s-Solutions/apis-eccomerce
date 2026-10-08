import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/configuration';
import { InMemoryApiKeyStore } from '../src/auth/in-memory-api-key.store';
import { apiKeyPrefix, generateApiKey, hashApiKey } from '../src/auth/api-key.hash';
import { QuotaExceededError } from '../src/auth/quota-exceeded.error';

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
