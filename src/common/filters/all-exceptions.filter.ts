import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

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
