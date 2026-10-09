import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
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
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import {
  RawQuerySchema,
  type RawQueryDto,
  withRaw,
} from '../../common/courier/raw-query';
import {
  AgenciesQuerySchema,
  type AgenciesQueryDto,
  AgenciesSearchSchema,
  type AgenciesSearchDto,
  searchAgencies,
} from '../../common/courier/agency-search';
import { orNotFound } from '../../common/courier/locations';
import { Cost } from '../../auth/cost.decorator';
import { ForProduct } from '../../auth/product.decorator';
import { ShalomService } from './shalom.service';
import {
  SHALOM_BATCH_MAX,
  ShalomStatusSchema,
  type ShalomStatusDto,
  ShalomTrackBatchSchema,
  type ShalomTrackBatchDto,
  ShalomTrackSchema,
  type ShalomTrackDto,
} from './dto/shalom.dto';

const RAW_QUERY = {
  name: 'raw',
  required: false,
  enum: ['1', '0'],
  description: 'Incluye la respuesta cruda de Shalom (pesa más; en el rastreo trae datos personales).',
} as const;

const TRACK_BODY: SchemaObject = {
  type: 'object',
  required: ['orderNumber', 'orderCode'],
  properties: {
    orderNumber: { type: 'string', example: '12345678' },
    orderCode: { type: 'string', example: 'AB12' },
  },
};

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
    description: 'Filtros por nombre, sin tildes: q, department, province, district. Las que tienen `receivesShipments: false` solo despachan.',
  })
  @ApiQuery(RAW_QUERY)
  async agencies(
    @Query(new ZodValidationPipe(AgenciesQuerySchema)) query: AgenciesQueryDto,
  ) {
    const list = await this.shalom.agencies(query);
    return list.map((a) => withRaw(a, query.raw));
  }

  @Get('agencies/search')
  @Cost(0)
  @ApiOperation({
    summary: 'Busca agencias de Shalom por ubicación, servicio aéreo o cercanía',
    description:
      '`near=lat,lng` ordena por distancia (`distanceKm`) y `radiusKm` limita el radio. `air=1`: con servicio aéreo. Por defecto solo las que reciben envíos (`receivesShipments=0` para todas). `limit` hasta 200 (20 por defecto).',
  })
  @ApiQuery(RAW_QUERY)
  async search(
    @Query(new ZodValidationPipe(AgenciesSearchSchema)) query: AgenciesSearchDto,
  ) {
    const list = searchAgencies(await this.shalom.allAgencies(), query);
    return list.map((a) => withRaw(a, query.raw));
  }

  @Get('locations/departments')
  @Cost(0)
  @ApiOperation({ summary: 'Departamentos (id = ubigeo INEI de 2 dígitos)' })
  departments() {
    return this.shalom.departments();
  }

  @Get('locations/departments/:department/provinces')
  @Cost(0)
  @ApiOperation({ summary: 'Provincias de un departamento (id de 4 dígitos)' })
  async provinces(@Param('department') department: string) {
    return orNotFound(await this.shalom.provinces(department), 'No existe ese departamento.');
  }

  @Get('locations/departments/:department/provinces/:province/districts')
  @Cost(0)
  @ApiOperation({ summary: 'Distritos de una provincia (id = ubigeo de 6 dígitos)' })
  async districts(@Param('department') department: string, @Param('province') province: string) {
    return orNotFound(await this.shalom.districts(department, province), 'No existe esa provincia en ese departamento.');
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
  @ApiBody({ schema: TRACK_BODY })
  async track(
    @Body(new ZodValidationPipe(ShalomTrackSchema)) dto: ShalomTrackDto,
    @Query(new ZodValidationPipe(RawQuerySchema)) query: RawQueryDto,
  ) {
    const result = await this.shalom.track(dto);
    if (!result) throw new NotFoundException('No se encontró la guía con esa clave en Shalom.');
    return withRaw(result, query.raw);
  }

  @Post('track/batch')
  @HttpCode(HttpStatus.OK)
  // Cada guía resuelve su propio captcha: una consulta por guía.
  @Cost((req) => {
    const orders = (req.body as { orders?: unknown[] } | undefined)?.orders;
    return Array.isArray(orders) ? orders.length : 1;
  })
  @ApiOperation({
    summary: `Rastrea hasta ${SHALOM_BATCH_MAX} guías de Shalom (una consulta por guía)`,
    description: 'Mismo orden que `orders`; `null` en las guías que Shalom no tiene con esa clave.',
  })
  @ApiQuery(RAW_QUERY)
  @ApiBody({ schema: { type: 'object', required: ['orders'], properties: { orders: { type: 'array', items: TRACK_BODY } } } })
  async trackBatch(
    @Body(new ZodValidationPipe(ShalomTrackBatchSchema)) dto: ShalomTrackBatchDto,
    @Query(new ZodValidationPipe(RawQuerySchema)) query: RawQueryDto,
  ) {
    const results = await this.shalom.trackBatch(dto.orders);
    return results.map((r) => r && withRaw(r, query.raw));
  }
}
