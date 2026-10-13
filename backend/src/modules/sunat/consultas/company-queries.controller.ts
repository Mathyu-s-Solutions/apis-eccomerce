import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { SunatCompany } from '../../../../generated/prisma';
import { Cost } from '../../../auth/cost.decorator';
import { ForProduct } from '../../../auth/product.decorator';
import { Company, CompanyGuard } from '../company.guard';
import { type SireQueryDto, SireQuerySchema, type ValidityDto, ValiditySchema } from '../dto/consultas.dto';
import { SunatValidationPipe } from '../sunat-validation.pipe';
import { lookupCost } from './consultas.controller';
import { SireService } from './sire.service';
import { ValidityService } from './validity.service';

const SIRE_QUERY = [
  { name: 'period', required: true, example: '202609', description: 'Periodo AAAAMM' },
  { name: 'page', required: false, example: 1 },
  { name: 'per_page', required: false, example: 50, description: 'Hasta 100' },
  { name: 'start_date', required: false, example: '2026-09-01' },
  { name: 'end_date', required: false, example: '2026-09-30' },
  { name: 'document_type', required: false, example: '01', description: '01 factura, 03 boleta, 07 nota de crédito, 08 nota de débito' },
  { name: 'document_ruc', required: false, description: 'RUC del proveedor (compras) o documento del cliente (ventas)' },
  { name: 'refresh', required: false, enum: ['1', '0'], description: 'Vuelve a pedir la propuesta a SUNAT (se guarda 10 minutos)' },
] as const;

/** Consultas que se hacen con las credenciales de la empresa: validez de comprobantes y SIRE. */
@ApiTags('sunat · consultas')
@ApiSecurity('api-key')
@ApiHeader({ name: 'x-ruc', required: false, description: 'RUC de la empresa que consulta. Solo hace falta si tu cuenta tiene más de una.' })
@ForProduct('sunat')
@UseGuards(CompanyGuard)
@Controller('sunat')
export class CompanyQueriesController {
  constructor(
    private readonly validity: ValidityService,
    private readonly sire: SireService,
  ) {}

  @Post(['cpe/validez', 'cpe/validity'])
  @HttpCode(HttpStatus.OK)
  @Cost(lookupCost)
  @ApiOperation({
    summary: 'Consulta de validez de un comprobante de cualquier emisor',
    description:
      'Usa la consulta integrada oficial de SUNAT con las credenciales de API de tu empresa (`api_client_id` y `api_client_secret`). ' +
      'Devuelve si el comprobante existe, está aceptado o anulado, y el estado y condición del RUC emisor.',
  })
  @ApiBody({ schema: { type: 'object', example: { documento: 'factura', ruc_emisor: '20553300429', serie: 'FF01', numero: 2259, fecha_de_emision: '2024-07-12', total: '3411.38' } } })
  async check(@Company() company: SunatCompany, @Body(new SunatValidationPipe(ValiditySchema)) dto: ValidityDto) {
    return { success: true, message: 'Consulta realizada correctamente', payload: await this.validity.check(company, dto) };
  }

  @Get(['rce', 'sire/rce'])
  @Cost(lookupCost)
  @ApiOperation({
    summary: 'Reporte de compras (SIRE · RCE): comprobantes que tus proveedores emitieron a tu RUC',
    description: 'La propuesta del Registro de Compras Electrónico de SUNAT para el periodo, paginada. Necesita las credenciales de API y el usuario SOL de la empresa.',
  })
  @ApiQuery(SIRE_QUERY[0])
  @ApiQuery(SIRE_QUERY[1])
  @ApiQuery(SIRE_QUERY[2])
  @ApiQuery(SIRE_QUERY[3])
  @ApiQuery(SIRE_QUERY[4])
  @ApiQuery(SIRE_QUERY[5])
  @ApiQuery(SIRE_QUERY[6])
  @ApiQuery(SIRE_QUERY[7])
  async purchases(@Company() company: SunatCompany, @Query(new SunatValidationPipe(SireQuerySchema)) q: SireQueryDto) {
    return { success: true, message: 'Reporte de compras obtenido correctamente', payload: await this.sire.report(company, 'rce', q) };
  }

  @Get(['rvie', 'sire/rvie'])
  @Cost(lookupCost)
  @ApiOperation({
    summary: 'Reporte de ventas (SIRE · RVIE): comprobantes emitidos por tu RUC',
    description: 'La propuesta del Registro de Ventas e Ingresos Electrónico de SUNAT para el periodo, paginada. Necesita las credenciales de API y el usuario SOL de la empresa.',
  })
  @ApiQuery(SIRE_QUERY[0])
  @ApiQuery(SIRE_QUERY[1])
  @ApiQuery(SIRE_QUERY[2])
  @ApiQuery(SIRE_QUERY[3])
  @ApiQuery(SIRE_QUERY[4])
  @ApiQuery(SIRE_QUERY[5])
  @ApiQuery(SIRE_QUERY[6])
  @ApiQuery(SIRE_QUERY[7])
  async sales(@Company() company: SunatCompany, @Query(new SunatValidationPipe(SireQuerySchema)) q: SireQueryDto) {
    return { success: true, message: 'Reporte de ventas obtenido correctamente', payload: await this.sire.report(company, 'rvie', q) };
  }
}
