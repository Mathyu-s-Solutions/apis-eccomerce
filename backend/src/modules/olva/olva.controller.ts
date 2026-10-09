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
import { OlvaService } from './olva.service';
import {
  OlvaQuoteSchema,
  type OlvaQuoteDto,
  OlvaTrackBatchSchema,
  type OlvaTrackBatchDto,
  OlvaTrackSchema,
  type OlvaTrackDto,
} from './dto/olva.dto';

const RAW_QUERY = {
  name: 'raw',
  required: false,
  enum: ['1', '0'],
  description: 'Incluye la respuesta cruda de Olva (pesa más; en el rastreo trae datos personales).',
} as const;

@ApiTags('olva')
@ApiSecurity('api-key')
@ForProduct('olva')
@Controller('olva')
export class OlvaController {
  constructor(private readonly olva: OlvaService) {}

  @Post('track')
  @HttpCode(HttpStatus.OK)
  @Cost(1)
  @ApiOperation({ summary: 'Rastrea una guía de Olva' })
  @ApiQuery(RAW_QUERY)
  @ApiNotFoundResponse({ description: 'Olva no tiene esa guía con ese año de emisión (no gasta cuota).' })
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
  async track(
    @Body(new ZodValidationPipe(OlvaTrackSchema)) dto: OlvaTrackDto,
    @Query(new ZodValidationPipe(RawQuerySchema)) query: RawQueryDto,
  ) {
    const result = await this.olva.track(dto);
    if (!result) throw new NotFoundException('No se encontró la guía en Olva con ese año de emisión.');
    return withRaw(result, query.raw);
  }

  @Post('track/batch')
  @HttpCode(HttpStatus.OK)
  @Cost(1)
  @ApiOperation({
    summary: 'Rastrea hasta 50 guías de Olva',
    description: 'Mismo orden que `orders`; `null` en las guías que Olva no tiene.',
  })
  @ApiQuery(RAW_QUERY)
  async trackBatch(
    @Body(new ZodValidationPipe(OlvaTrackBatchSchema)) dto: OlvaTrackBatchDto,
    @Query(new ZodValidationPipe(RawQuerySchema)) query: RawQueryDto,
  ) {
    const results = await this.olva.trackBatch(dto.orders);
    return results.map((r) => r && withRaw(r, query.raw));
  }

  @Get('agencies')
  @Cost(0)
  @ApiOperation({
    summary: 'Lista agencias/tiendas de Olva (cacheable)',
    description: 'Filtros por nombre, sin tildes: q, department, province, district.',
  })
  @ApiQuery(RAW_QUERY)
  async agencies(
    @Query(new ZodValidationPipe(AgenciesQuerySchema)) query: AgenciesQueryDto,
  ) {
    const list = await this.olva.agencies(query);
    return list.map((a) => withRaw(a, query.raw));
  }

  @Get('agencies/search')
  @Cost(0)
  @ApiOperation({
    summary: 'Busca agencias de Olva por ubicación o cercanía',
    description:
      '`near=lat,lng` ordena por distancia (`distanceKm`) y `radiusKm` limita el radio. `limit` hasta 200 (20 por defecto). Olva no informa servicio aéreo.',
  })
  @ApiQuery(RAW_QUERY)
  async search(
    @Query(new ZodValidationPipe(AgenciesSearchSchema)) query: AgenciesSearchDto,
  ) {
    const list = searchAgencies(await this.olva.allAgencies(), query);
    return list.map((a) => withRaw(a, query.raw));
  }

  @Get('locations/ubigeos')
  @Cost(0)
  @ApiOperation({ summary: 'Catálogo de ubigeos de Olva (lista plana)' })
  ubigeos() {
    return this.olva.ubigeos();
  }

  @Get('locations/departments')
  @Cost(0)
  @ApiOperation({ summary: 'Departamentos (id = ubigeo INEI de 2 dígitos)' })
  departments() {
    return this.olva.departments();
  }

  @Get('locations/departments/:department/provinces')
  @Cost(0)
  @ApiOperation({ summary: 'Provincias de un departamento (id de 4 dígitos)' })
  async provinces(@Param('department') department: string) {
    return orNotFound(await this.olva.provinces(department), 'No existe ese departamento.');
  }

  @Get('locations/departments/:department/provinces/:province/districts')
  @Cost(0)
  @ApiOperation({ summary: 'Distritos de una provincia (id = ubigeo de 6 dígitos)' })
  async districts(@Param('department') department: string, @Param('province') province: string) {
    return orNotFound(await this.olva.districts(department, province), 'No existe esa provincia en ese departamento.');
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
