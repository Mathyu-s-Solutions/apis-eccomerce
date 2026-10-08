import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, from, type Observable, switchMap, throwError } from 'rxjs';
import { API_KEY_STORE, type ApiKeyRecord, type ApiKeyStore } from './api-key.store';
import { BILLING_COST_KEY } from './cost.decorator';
import { REQUEST_KEY_PROP } from './current-key.decorator';

/**
 * Cobro de cuota según @Cost(n):
 *  1. Reserva las unidades ANTES del handler. Si no hay saldo -> 429 y no se
 *     ejecuta nada (no gastamos captcha ni llamadas al upstream).
 *  2. Si el handler (o la validación) falla, devuelve las unidades.
 * Resultado: solo se cobran las respuestas exitosas.
 */
@Injectable()
export class QuotaInterceptor implements NestInterceptor {
  private readonly logger = new Logger(QuotaInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(API_KEY_STORE) private readonly store: ApiKeyStore,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const cost =
      this.reflector.getAllAndOverride<number>(BILLING_COST_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? 0;

    const req = ctx.switchToHttp().getRequest();
    const record: ApiKeyRecord | undefined = req[REQUEST_KEY_PROP];

    if (cost <= 0 || !record) return next.handle();

    return from(this.store.consume(record, cost)).pipe(
      switchMap(() =>
        next.handle().pipe(
          catchError((err) =>
            from(
              this.store.refund(record, cost).catch((e) =>
                this.logger.error(`No se pudo devolver cuota a ${record.prefix}: ${String(e)}`),
              ),
            ).pipe(switchMap(() => throwError(() => err))),
          ),
        ),
      ),
    );
  }
}
