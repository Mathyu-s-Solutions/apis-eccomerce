import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Cost } from '../../auth/cost.decorator';
import { ForProduct } from '../../auth/product.decorator';
import { SunatService } from './sunat.service';

@ApiTags('sunat')
@ApiSecurity('api-key')
@ForProduct('sunat')
@Controller('sunat')
export class SunatController {
  constructor(private readonly sunat: SunatService) {}

  @Post('documents')
  @Cost(1)
  @ApiOperation({ summary: '[WIP] Emite un comprobante electrónico (factura/boleta)' })
  emit() {
    return this.sunat.emitDocument();
  }

  @Post('status')
  @Cost(0)
  @ApiOperation({ summary: '[WIP] Consulta el estado de un comprobante' })
  status() {
    return this.sunat.getStatus();
  }

  @Get('ruc/:ruc')
  @Cost(0)
  @ApiOperation({ summary: '[WIP] Consulta RUC (padrón SUNAT)' })
  ruc(@Param('ruc') ruc: string) {
    return this.sunat.consultaRuc(ruc);
  }
}
