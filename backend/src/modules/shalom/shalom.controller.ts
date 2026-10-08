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
import { ShalomService } from './shalom.service';
import {
  ShalomAgenciesQuerySchema,
  type ShalomAgenciesQueryDto,
  ShalomStatusSchema,
  type ShalomStatusDto,
  ShalomTrackSchema,
  type ShalomTrackDto,
} from './dto/shalom.dto';

@ApiTags('shalom')
@ApiSecurity('api-key')
@Controller('shalom')
export class ShalomController {
  constructor(private readonly shalom: ShalomService) {}

  @Get('agencies')
  @Cost(0)
  @ApiOperation({ summary: 'Lista agencias de Shalom (cacheable, sin captcha)' })
  agencies(
    @Query(new ZodValidationPipe(ShalomAgenciesQuerySchema))
    query: ShalomAgenciesQueryDto,
  ) {
    return this.shalom.agencies(query);
  }

  @Post('track/status')
  @HttpCode(HttpStatus.OK)
  @Cost(0)
  @ApiOperation({
    summary: 'Estado por ose_id (endpoint abierto). No enumerar ids.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['oseId'],
      properties: { oseId: { type: 'string', example: '123456' } },
    },
  })
  status(@Body(new ZodValidationPipe(ShalomStatusSchema)) dto: ShalomStatusDto) {
    return this.shalom.statusByOseId(dto.oseId);
  }

  @Post('track')
  @HttpCode(HttpStatus.OK)
  @Cost(1)
  @ApiOperation({
    summary: 'Rastreo por guía + clave (requiere captcha configurado)',
  })
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
  track(@Body(new ZodValidationPipe(ShalomTrackSchema)) dto: ShalomTrackDto) {
    return this.shalom.track(dto);
  }
}
