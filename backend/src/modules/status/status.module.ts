import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShalomModule } from '../shalom/shalom.module';
import { SunatModule } from '../sunat/sunat.module';
import { StatusAlerts } from './status-alerts';
import { StatusService } from './status.service';

/** Chequeos de la página de estado y alertas al admin; los corre el worker (`/v1/internal/cron/tick`). */
@Module({
  imports: [ShalomModule, SunatModule, NotificationsModule],
  providers: [StatusService, StatusAlerts],
  exports: [StatusService],
})
export class StatusModule {}
