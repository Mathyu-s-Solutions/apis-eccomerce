import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import type { Agency } from '../../common/courier/courier-adapter.interface';
import { filterAgencies } from '../../common/courier/agency-search';
import { Public } from '../../auth/public.decorator';
import { ShalomService } from '../shalom/shalom.service';
import { OlvaService } from '../olva/olva.service';

const PublicQuerySchema = z.object({ q: z.string().trim().max(80).optional() });
type PublicQueryDto = z.infer<typeof PublicQuerySchema>;

const DEMO_LIMIT = 20;

/** Lo mínimo para mostrar una agencia: sin horario, sin respuesta cruda. */
function slim(list: Agency[], q: string | undefined) {
  return filterAgencies(list.filter((a) => a.receivesShipments), { q })
    .slice(0, DEMO_LIMIT)
    .map(({ code, name, department, province, district, address, latitude, longitude }) => ({
      code, name, department, province, district, address, latitude, longitude,
    }));
}

/**
 * Demo sin API key, para probar la API antes de crear una cuenta (y para las
 * landings): hasta 20 agencias que coincidan con `q`, 30 consultas por minuto por IP.
 */
@ApiTags('public')
@Public()
@Throttle({ key: { limit: 30, ttl: 60_000 } })
@Controller('public')
export class PublicController {
  constructor(
    private readonly shalom: ShalomService,
    private readonly olva: OlvaService,
  ) {}

  @Get('shalom/agencies')
  @ApiOperation({ summary: 'Demo sin key: hasta 20 agencias de Shalom (filtro q)' })
  async shalomAgencies(@Query(new ZodValidationPipe(PublicQuerySchema)) query: PublicQueryDto) {
    return slim(await this.shalom.allAgencies(), query.q);
  }

  @Get('olva/agencies')
  @ApiOperation({ summary: 'Demo sin key: hasta 20 agencias de Olva (filtro q)' })
  async olvaAgencies(@Query(new ZodValidationPipe(PublicQuerySchema)) query: PublicQueryDto) {
    return slim(await this.olva.allAgencies(), query.q);
  }
}
