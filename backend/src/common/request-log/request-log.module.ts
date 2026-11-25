import { Global, Module } from '@nestjs/common';
import { RequestLogService } from './request-log.service';

/** Registro de requests para el panel de admin (lo engancha main.ts; lo poda el worker). */
@Global()
@Module({
  providers: [RequestLogService],
  exports: [RequestLogService],
})
export class RequestLogModule {}
