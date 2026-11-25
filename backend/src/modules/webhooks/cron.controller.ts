import { timingSafeEqual } from 'node:crypto';
import { Controller, Headers, HttpCode, HttpStatus, Inject, NotFoundException, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { Public } from '../../auth/public.decorator';
import { TrackingSubscriptionsService } from './tracking-subscriptions.service';
import { WebhooksService } from './webhooks.service';
import { DocumentsService } from '../sunat/documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StatusService } from '../status/status.service';
import { RequestLogService } from '../../common/request-log/request-log.service';

/**
 * Worker: lo llama Cloud Scheduler cada 10 minutos con `x-cron-secret`.
 * Revisa las guías que tocan, manda los webhooks pendientes, reintenta los
 * comprobantes que SUNAT dejó sin responder, manda los avisos por correo
 * (cuota, webhook caído, certificado de SUNAT por vencer), corre los chequeos
 * de la página de estado y poda el registro de requests.
 */
@ApiExcludeController()
@Public()
@Controller('internal/cron')
export class CronController {
  constructor(
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
    private readonly subs: TrackingSubscriptionsService,
    private readonly webhooks: WebhooksService,
    private readonly sunat: DocumentsService,
    private readonly notifications: NotificationsService,
    private readonly status: StatusService,
    private readonly requestLog: RequestLogService,
  ) {}

  @Post('tick')
  @HttpCode(HttpStatus.OK)
  async tick(@Headers('x-cron-secret') secret?: string) {
    const expected = this.config.cron.secret;
    if (!expected) throw new NotFoundException();
    const a = Buffer.from(secret ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();

    // En paralelo con el resto (esperas a servicios externos: ~25 s, hasta ~1.5 min si el
    // rastreo de Shalom no responde). Avisa al admin si algo se cayó o volvió. No lanza.
    const status = this.status.runChecks();
    const tracking = await this.subs.pollDue();
    const deliveries = await this.webhooks.dispatchDue();
    const sunat = await this.sunat.pollDue();
    // Después de los webhooks: las entregas que murieron en este tick ya cuentan.
    const notifications = await this.notifications.runDue();
    // El registro de requests del panel de admin guarda 30 días.
    const requestLog = await this.requestLog.prune().catch(() => -1);
    return { tracking, deliveries, sunat, notifications, requestLog, status: await status };
  }
}
