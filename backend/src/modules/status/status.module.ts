import { Module } from '@nestjs/common';
import { ShalomModule } from '../shalom/shalom.module';
import { SunatModule } from '../sunat/sunat.module';
import { StatusService } from './status.service';

/** Chequeos de la página de estado; los corre el worker (`/v1/internal/cron/tick`). */
@Module({
  imports: [ShalomModule, SunatModule],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
