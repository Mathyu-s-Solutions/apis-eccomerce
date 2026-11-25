import { Module } from '@nestjs/common';
import { Mailer } from './mailer';
import { NotificationsService } from './notifications.service';

/** Avisos por correo del worker (los corre CronController). */
@Module({
  providers: [Mailer, NotificationsService],
  // El Mailer también lo usan las alertas de la página de estado.
  exports: [NotificationsService, Mailer],
})
export class NotificationsModule {}
