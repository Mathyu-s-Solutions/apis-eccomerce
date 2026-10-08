import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { API_KEY_STORE, type ApiKeyRecord, type ApiKeyStore } from './api-key.store';
import { CurrentKey } from './current-key.decorator';

@ApiTags('auth')
@ApiSecurity('api-key')
@Controller()
export class AuthController {
  constructor(@Inject(API_KEY_STORE) private readonly store: ApiKeyStore) {}

  @Get('validate')
  @ApiOperation({ summary: 'Valida la API key y devuelve el estado de cuota' })
  async validate(@CurrentKey() key: ApiKeyRecord) {
    const usage = await this.store.usage(key);
    return {
      valid: true,
      name: key.name,
      limit: usage.limit,
      used: usage.used,
      remaining: usage.remaining,
      period: usage.period,
    };
  }
}
