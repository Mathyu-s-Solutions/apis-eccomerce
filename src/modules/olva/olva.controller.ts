import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { Cost } from '../../auth/cost.decorator';
import { OlvaService } from './olva.service';
import {
  OlvaAgenciesQuerySchema,
  type OlvaAgenciesQueryDto,
  OlvaQuoteSchema,
  type OlvaQuoteDto,
  OlvaTrackBatchSchema,
  type OlvaTrackBatchDto,
  OlvaTrackSchema,
  type OlvaTrackDto,
} from './dto/olva.dto';

@ApiTags('olva')
@ApiSecurity('api-key')
@Controller('olva')
export class OlvaController {
  constructor(private readonly olva: OlvaService) {}

  @Post('track')
  @HttpCode(HttpStatus.OK)
  @Cost(1)
  @ApiOperation({ summary: 'Rastrea una guía de Olva' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['orderNumber'],
      properties: {
        orderNumber: { type: 'string', example: '1234567890' },
        orderCode: { type: 'string', example: '26', description: 'Año de emisión' },
      },
    },
  })
  track(@Body(new ZodValidationPipe(OlvaTrackSchema)) dto: OlvaTrackDto) {
    return this.olva.track(dto);
  }

  @Post('track/batch')
  @HttpCode(HttpStatus.OK)
  @Cost(1)
  @ApiOperation({ summary: 'Rastrea hasta 50 guías de Olva' })
  trackBatch(
    @Body(new ZodValidationPipe(OlvaTrackBatchSchema)) dto: OlvaTrackBatchDto,
  ) {
    return this.olva.trackBatch(dto.orders);
  }

  @Get('agencies')
  @Cost(0)
  @ApiOperation({ summary: 'Lista agencias/tiendas de Olva (cacheable)' })
  agencies(
    @Query(new ZodValidationPipe(OlvaAgenciesQuerySchema))
    query: OlvaAgenciesQueryDto,
  ) {
    return this.olva.agencies(query);
  }

  @Get('locations/ubigeos')
  @Cost(0)
  @ApiOperation({ summary: 'Catálogo de ubigeos de Olva' })
  ubigeos() {
    return this.olva.ubigeos();
  }

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @Cost(1)
  @ApiOperation({ summary: 'Cotiza un envío de Olva' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['origin', 'destination', 'shipmentType', 'weight'],
      properties: {
        origin: { type: 'string', example: '150101' },
        destination: { type: 'string', example: '040101' },
        deliveryType: { type: 'string', enum: ['D', 'O'], example: 'O' },
        shipmentType: { type: 'integer', enum: [1, 2], example: 1 },
        weight: { type: 'number', example: 0.5 },
        length: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        partnerRate: { type: 'boolean', example: false },
      },
    },
  })
  quote(@Body(new ZodValidationPipe(OlvaQuoteSchema)) dto: OlvaQuoteDto) {
    return this.olva.quote(dto);
  }
}
