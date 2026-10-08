import { HttpException, HttpStatus } from '@nestjs/common';

export class QuotaExceededError extends HttpException {
  constructor(limit: number, period: string) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Quota Exceeded',
        message: `Cuota mensual agotada (${limit}).`,
        period,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
