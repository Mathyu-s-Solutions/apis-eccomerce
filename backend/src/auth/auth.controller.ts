import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { API_KEY_STORE, type ApiKeyRecord, type ApiKeyStore } from './api-key.store';
import { CurrentKey } from './current-key.decorator';
import { PRODUCTS, type Product } from './product.decorator';

@ApiTags('auth')
@ApiSecurity('api-key')
@Controller()
export class AuthController {
  constructor(@Inject(API_KEY_STORE) private readonly store: ApiKeyStore) {}

  @Get('validate')
  @ApiOperation({
    summary: 'Valida la API key y devuelve el estado de cuota',
    description:
      'Con una key de una API, la cuota es la del plan de esa API. Con una key de todas las APIs, `plans` trae el plan y el consumo de cada una.',
  })
  async validate(@CurrentKey() key: ApiKeyRecord) {
    // Key sin dueño o de una sola API: una cuota. Key de todas las APIs: una por API.
    const products: Array<Product | undefined> = !key.userId
      ? [undefined]
      : key.product === 'all'
        ? [...PRODUCTS]
        : [key.product as Product];
    const usages = await Promise.all(products.map((p) => this.store.usage(key, p)));
    const [first] = usages;
    return {
      valid: true,
      name: key.name,
      product: key.product,
      ...(products.length === 1
        ? { plan: first.plan, limit: first.limit, used: first.used, remaining: first.remaining }
        : {}),
      period: first.period,
      ...(key.userId
        ? {
            plans: usages.map((u, i) => ({
              product: products[i],
              plan: u.plan,
              limit: u.limit,
              used: u.used,
              remaining: u.remaining,
              expiresAt: key.plans[products[i]!]?.expiresAt ?? null,
            })),
          }
        : {}),
    };
  }
}
