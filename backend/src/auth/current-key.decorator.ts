import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ApiKeyRecord } from './api-key.store';

export const REQUEST_KEY_PROP = 'apiKeyRecord';

/** Inyecta el ApiKeyRecord autenticado en el handler. */
export const CurrentKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiKeyRecord | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req[REQUEST_KEY_PROP];
  },
);
