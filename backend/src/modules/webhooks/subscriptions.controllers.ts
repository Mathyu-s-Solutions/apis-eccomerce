import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { Cost } from '../../auth/cost.decorator';
import { CurrentKey } from '../../auth/current-key.decorator';
import { ForProduct } from '../../auth/product.decorator';
import type { ApiKeyRecord } from '../../auth/api-key.store';
import { ShalomTrackSchema, type ShalomTrackDto } from '../shalom/dto/shalom.dto';
import { OlvaTrackSchema, type OlvaTrackDto } from '../olva/dto/olva.dto';
import { TrackingSubscriptionsService } from './tracking-subscriptions.service';
import {
  SubscriptionsListQuerySchema,
  type SubscriptionsListQueryDto,
  UnsubscribeQuerySchema,
  type UnsubscribeQueryDto,
} from './webhooks.dto';

const SUBSCRIBE = {
  summary: 'Vigila una guía: avisa por webhook cada vez que cambia de estado',
  description:
    'Valida la guía una vez (1 consulta); después la revisamos sin costo hasta que se entrega o devuelve (máximo 60 días). Plan gratis: 5 guías a la vez.',
};

@ApiTags('shalom')
@ApiSecurity('api-key')
@ForProduct('shalom')
@Controller('shalom/tracking/subscriptions')
export class ShalomSubscriptionsController {
  constructor(private readonly subs: TrackingSubscriptionsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Cost(1)
  @Throttle({ key: { limit: 60, ttl: 60_000 } })
  @ApiOperation(SUBSCRIBE)
  subscribe(@CurrentKey() key: ApiKeyRecord, @Body(new ZodValidationPipe(ShalomTrackSchema)) dto: ShalomTrackDto) {
    return this.subs.subscribe(key, 'shalom', dto);
  }

  @Get()
  @ApiOperation({ summary: 'Guías de Shalom que vigilas' })
  list(@CurrentKey() key: ApiKeyRecord, @Query(new ZodValidationPipe(SubscriptionsListQuerySchema)) q: SubscriptionsListQueryDto) {
    return this.subs.list(key, 'shalom', q.includeInactive);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deja de vigilar una guía (?orderNumber=)' })
  unsubscribe(@CurrentKey() key: ApiKeyRecord, @Query(new ZodValidationPipe(UnsubscribeQuerySchema)) q: UnsubscribeQueryDto) {
    return this.subs.unsubscribe(key, 'shalom', q.orderNumber);
  }
}

@ApiTags('olva')
@ApiSecurity('api-key')
@ForProduct('olva')
@Controller('olva/tracking/subscriptions')
export class OlvaSubscriptionsController {
  constructor(private readonly subs: TrackingSubscriptionsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Cost(1)
  @ApiOperation(SUBSCRIBE)
  subscribe(@CurrentKey() key: ApiKeyRecord, @Body(new ZodValidationPipe(OlvaTrackSchema)) dto: OlvaTrackDto) {
    return this.subs.subscribe(key, 'olva', dto);
  }

  @Get()
  @ApiOperation({ summary: 'Guías de Olva que vigilas' })
  list(@CurrentKey() key: ApiKeyRecord, @Query(new ZodValidationPipe(SubscriptionsListQuerySchema)) q: SubscriptionsListQueryDto) {
    return this.subs.list(key, 'olva', q.includeInactive);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deja de vigilar una guía (?orderNumber=)' })
  unsubscribe(@CurrentKey() key: ApiKeyRecord, @Query(new ZodValidationPipe(UnsubscribeQuerySchema)) q: UnsubscribeQueryDto) {
    return this.subs.unsubscribe(key, 'olva', q.orderNumber);
  }
}
