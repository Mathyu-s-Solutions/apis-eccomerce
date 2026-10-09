import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { CurrentKey } from '../../auth/current-key.decorator';
import type { ApiKeyRecord } from '../../auth/api-key.store';
import { TrackingSubscriptionsService } from './tracking-subscriptions.service';
import { WebhooksService } from './webhooks.service';
import { DeliveriesQuerySchema, type DeliveriesQueryDto, WebhookConfigSchema, type WebhookConfigDto } from './webhooks.dto';

const owner = (key: ApiKeyRecord) => TrackingSubscriptionsService.ownerOf(key);

/**
 * Webhook de la cuenta (uno para todas sus APIs). Cada entrega lleva
 * `x-mathyu-signature: t=<unix>,v1=<HMAC-SHA256(secreto, "<t>.<cuerpo>")>`.
 */
@ApiTags('webhooks')
@ApiSecurity('api-key')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'Configuración del webhook (secreto enmascarado)' })
  async get(@CurrentKey() key: ApiKeyRecord) {
    const config = await this.webhooks.getConfig(owner(key));
    if (!config) throw new NotFoundException('Tu cuenta no tiene webhook. Créalo con PUT /v1/webhooks.');
    return config;
  }

  @Put()
  @ApiOperation({
    summary: 'Crea o cambia el webhook (https a un host público)',
    description: 'La primera vez, o con `rotateSecret: true`, devuelve el secreto `whsec_…` completo: guárdalo, no se vuelve a mostrar.',
  })
  put(@CurrentKey() key: ApiKeyRecord, @Body(new ZodValidationPipe(WebhookConfigSchema)) dto: WebhookConfigDto) {
    return this.webhooks.setConfig(owner(key), dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borra el webhook (las guías se siguen vigilando, sin avisos)' })
  async remove(@CurrentKey() key: ApiKeyRecord) {
    if (!(await this.webhooks.remove(owner(key)))) throw new NotFoundException('Tu cuenta no tiene webhook.');
    return { deleted: true };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manda un evento webhook.test ahora y devuelve el resultado' })
  test(@CurrentKey() key: ApiKeyRecord) {
    return this.webhooks.test(owner(key));
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'Historial de entregas (estado, intentos, último error)' })
  deliveries(@CurrentKey() key: ApiKeyRecord, @Query(new ZodValidationPipe(DeliveriesQuerySchema)) q: DeliveriesQueryDto) {
    return this.webhooks.deliveries(owner(key), q.page, q.limit);
  }

  @Post('deliveries/:id/redeliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reenvía una entrega (también las que se dieron por perdidas)' })
  redeliver(@CurrentKey() key: ApiKeyRecord, @Param('id') id: string) {
    return this.webhooks.redeliver(owner(key), id);
  }
}
