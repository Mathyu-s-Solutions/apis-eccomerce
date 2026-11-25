import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { logProps } from '../request-log/request-log.props';

/** Normaliza cualquier error a un JSON consistente y lo registra. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload =
      exception instanceof HttpException
        ? this.fromHttpException(exception)
        : {
            statusCode: status,
            error: 'Internal Server Error',
            message: 'Ocurrió un error inesperado',
          };

    // Para el registro de requests: el error tal como lo recibe el cliente.
    const { message, upstream, errors } = payload as { message?: unknown; upstream?: unknown; errors?: unknown };
    // La validación trae qué campo falló y por qué (sin el valor enviado).
    const fields = Array.isArray(errors)
      ? errors.map((e: { path?: unknown; message?: unknown }) => `${String(e?.path ?? '') || '(cuerpo)'}: ${String(e?.message ?? '')}`).join('; ')
      : '';
    logProps(req).error = {
      message: (Array.isArray(message) ? message.join('; ') : String(message ?? '')) + (fields ? ` (${fields})` : ''),
      upstream: typeof upstream === 'string' ? upstream : undefined,
    };

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status}: ${String(
          exception instanceof Error ? exception.stack : exception,
        )}`,
      );
    } else {
      this.logger.warn(`${req.method} ${req.url} -> ${status}`);
    }

    void res.status(status).send({
      success: false,
      ...payload,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }

  private fromHttpException(ex: HttpException): Record<string, unknown> {
    const body = ex.getResponse();
    if (typeof body === 'string') {
      return { statusCode: ex.getStatus(), message: body };
    }
    return body as Record<string, unknown>;
  }
}
