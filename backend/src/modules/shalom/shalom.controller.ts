import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import {
  RawQuerySchema,
  type RawQueryDto,
  withRaw,
} from '../../common/courier/raw-query';
import { Cost } from '../../auth/cost.decorator';
import { ForProduct } from '../../auth/product.decorator';
import { ShalomService } from './shalom.service';
import {
  ShalomAgenciesQuerySchema,
  type ShalomAgenciesQueryDto,
  ShalomStatusSchema,
  type ShalomStatusDto,
  ShalomTrackSchema,
  type ShalomTrackDto,
} from './dto/shalom.dto';

const RAW_QUERY = {
  name: 'raw',
  required: false,
  enum: ['1', '0'],
  description: 'Incluye la respuesta cruda de Shalom (pesa más; en el rastreo trae datos personales).',
} as const;

@ApiTags('shalom')
@ApiSecurity('api-key')
@ForProduct('shalom')
@Controller('shalom')
export class ShalomController {
  constructor(private readonly shalom: ShalomService) {}

  @Get('agencies')
  @Cost(0)
  @ApiOperation({
    summary: 'Lista agencias de Shalom (cacheable, sin captcha)',
    description: 'Las que tienen `receivesShipments: false` solo despachan: no sirven como destino.',
  })
  @ApiQuery(RAW_QUERY)
  async agencies(
    @Query(new ZodValidationPipe(ShalomAgenciesQuerySchema))
    query: ShalomAgenciesQueryDto,
  ) {
    const list = await this.shalom.agencies(query);
    return list.map((a) => withRaw(a, query.raw));
  }

  @Post('track/status')
  @HttpCode(HttpStatus.OK)
  @Cost(0)
  @ApiOperation({
    summary: 'Estado por ose_id (endpoint abierto). No enumerar ids.',
  })
  @ApiQuery(RAW_QUERY)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['oseId'],
      properties: { oseId: { type: 'string', example: '123456' } },
    },
  })
  async status(
    @Body(new ZodValidationPipe(ShalomStatusSchema)) dto: ShalomStatusDto,
    @Query(new ZodValidationPipe(RawQuerySchema)) query: RawQueryDto,
  ) {
    return withRaw(await this.shalom.statusByOseId(dto.oseId), query.raw);
  }

  @Post('track')
  @HttpCode(HttpStatus.OK)
  @Cost(1)
  @ApiOperation({
    summary: 'Rastreo por guía + clave (requiere captcha configurado)',
  })
  @ApiQuery(RAW_QUERY)
  @ApiNotFoundResponse({ description: 'Shalom no tiene esa guía con esa clave (no gasta cuota).' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['orderNumber', 'orderCode'],
      properties: {
        orderNumber: { type: 'string', example: '12345678' },
        orderCode: { type: 'string', example: 'AB12' },
      },
    },
  })
  async track(
    @Body(new ZodValidationPipe(ShalomTrackSchema)) dto: ShalomTrackDto,
    @Query(new ZodValidationPipe(RawQuerySchema)) query: RawQueryDto,
  ) {
    const result = await this.shalom.track(dto);
    if (!result) throw new NotFoundException('No se encontró la guía con esa clave en Shalom.');
    return withRaw(result, query.raw);
  }
}
