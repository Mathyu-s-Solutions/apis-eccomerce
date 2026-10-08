import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/configuration';
import { ApiKeyGuard } from '../src/auth/api-key.guard';
import { InMemoryApiKeyStore } from '../src/auth/in-memory-api-key.store';
import { ForProduct } from '../src/auth/product.decorator';

@ForProduct('olva')
class OlvaRoutes {
  track() {}
}
class FreeRoutes {
  validate() {}
}

function guardWith(keys: object[]) {
  const store = new InMemoryApiKeyStore({ auth: { apiKeysJson: JSON.stringify(keys) } } as unknown as AppConfig);
  store.onModuleInit();
  return new ApiKeyGuard(new Reflector(), store);
}

function ctx(cls: { prototype: object }, handler: string, key?: string) {
  const req: Record<string, unknown> = { headers: key ? { 'x-api-key': key } : {} };
  return {
    getHandler: () => (cls.prototype as Record<string, unknown>)[handler],
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

describe('ApiKeyGuard', () => {
  const guard = guardWith([
    { key: 'k-shalom', product: 'shalom' },
    { key: 'k-olva', product: 'olva' },
    { key: 'k-todas', product: 'all' },
  ]);

  it('la key tiene que ser de la API de la ruta o de todas', async () => {
    await expect(guard.canActivate(ctx(OlvaRoutes, 'track', 'k-olva'))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(OlvaRoutes, 'track', 'k-todas'))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(OlvaRoutes, 'track', 'k-shalom'))).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx(OlvaRoutes, 'track', 'k-shalom'))).rejects.toThrow(/es de Shalom/);
  });

  it('rutas sin API (validate) aceptan cualquier key; sin key, 401', async () => {
    await expect(guard.canActivate(ctx(FreeRoutes, 'validate', 'k-shalom'))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(OlvaRoutes, 'track'))).rejects.toThrow(UnauthorizedException);
  });
});
