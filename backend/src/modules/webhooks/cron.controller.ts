import { timingSafeEqual } from 'node:crypto';
import { Controller, Headers, HttpCode, HttpStatus, Inject, NotFoundException, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { Public } from '../../auth/public.decorator';
import { TrackingSubscriptionsService } from './tracking-subscriptions.service';
import { WebhooksService } from './webhooks.service';

/**
 * Worker: lo llama Cloud Scheduler cada 10 minutos con `x-cron-secret`.
 * Revisa las guías que tocan y manda los webhooks pendientes.
 */
@ApiExcludeController()
@Public()
@Controller('internal/cron')
export class CronController {
  constructor(
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
    private readonly subs: TrackingSubscriptionsService,
    private readonly webhooks: WebhooksService,
  ) {}

  @Post('tick')
  @HttpCode(HttpStatus.OK)
  async tick(@Headers('x-cron-secret') secret?: string) {
    const expected = this.config.cron.secret;
    if (!expected) throw new NotFoundException();
    const a = Buffer.from(secret ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();

    const tracking = await this.subs.pollDue();
    const deliveries = await this.webhooks.dispatchDue();
    return { tracking, deliveries };
  }
}
