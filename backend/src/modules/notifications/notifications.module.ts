import { Module } from '@nestjs/common';
import { Mailer } from './mailer';
import { NotificationsService } from './notifications.service';

/** Avisos por correo del worker (los corre CronController). */
@Module({
  providers: [Mailer, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
