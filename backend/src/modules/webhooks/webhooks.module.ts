import { Module } from '@nestjs/common';
import { ShalomModule } from '../shalom/shalom.module';
import { OlvaModule } from '../olva/olva.module';
import { CronController } from './cron.controller';
import { OlvaSubscriptionsController, ShalomSubscriptionsController } from './subscriptions.controllers';
import { TrackingSubscriptionsService } from './tracking-subscriptions.service';
import { WebhookSender } from './webhook-sender';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [ShalomModule, OlvaModule],
  controllers: [WebhooksController, ShalomSubscriptionsController, OlvaSubscriptionsController, CronController],
  providers: [WebhooksService, TrackingSubscriptionsService, WebhookSender],
})
export class WebhooksModule {}
