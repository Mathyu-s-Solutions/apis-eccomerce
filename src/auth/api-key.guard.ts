import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_KEY_STORE, type ApiKeyStore } from './api-key.store';
import { IS_PUBLIC_KEY } from './public.decorator';
import { REQUEST_KEY_PROP } from './current-key.decorator';

const HEADER = 'x-api-key';

/**
 * Guard global: exige `x-api-key` válida salvo en rutas @Public().
 * Deja el record en la request para que CurrentKey y la cuota lo usen.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(API_KEY_STORE) private readonly store: ApiKeyStore,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const key = this.extractKey(req);
    if (!key) {
      throw new UnauthorizedException(
        `Falta la cabecera ${HEADER} con tu API key.`,
      );
    }

    const record = await this.store.findByKey(key);
    if (!record) {
      throw new UnauthorizedException('API key inválida o deshabilitada.');
    }

    req[REQUEST_KEY_PROP] = record;
    return true;
  }

  private extractKey(req: {
    headers: Record<string, string | string[] | undefined>;
  }): string | null {
    const raw = req.headers[HEADER];
    if (Array.isArray(raw)) return raw[0] ?? null;
    return raw ?? null;
  }
}
