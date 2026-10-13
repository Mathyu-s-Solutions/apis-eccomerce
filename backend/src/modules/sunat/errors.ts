import { HttpException, HttpStatus } from '@nestjs/common';

/** Dato del cliente que no se puede emitir tal cual (422, no gasta cuota). */
export class SunatInputError extends HttpException {
  constructor(message: string, detail?: Record<string, unknown>) {
    super({ statusCode: HttpStatus.UNPROCESSABLE_ENTITY, error: 'Unprocessable Entity', message, ...(detail ? { payload: detail } : {}) }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
