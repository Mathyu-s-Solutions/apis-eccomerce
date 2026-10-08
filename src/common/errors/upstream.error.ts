import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Error al hablar con un upstream (Shalom, Olva, SUNAT). Se mapea a 502/504
 * para que el cliente distinga un fallo nuestro de un fallo del proveedor.
 */
export class UpstreamError extends HttpException {
  constructor(
    public readonly upstream: string,
    message: string,
    options: { status?: number; cause?: unknown; detail?: unknown } = {},
  ) {
    const status = options.status ?? HttpStatus.BAD_GATEWAY;
    super(
      {
        statusCode: status,
        error: 'Upstream Error',
        upstream,
        message,
        detail: options.detail,
      },
      status,
      { cause: options.cause },
    );
  }

  static timeout(upstream: string, ms: number): UpstreamError {
    return new UpstreamError(
      upstream,
      `El proveedor ${upstream} no respondió en ${ms}ms`,
      { status: HttpStatus.GATEWAY_TIMEOUT },
    );
  }
}
