import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { ApiKeyRecord } from '../../../auth/api-key.store';
import { Cost, type CostFn } from '../../../auth/cost.decorator';
import { REQUEST_KEY_PROP } from '../../../auth/current-key.decorator';
import { quotaScope } from '../../../auth/plan-quota';
import { ForProduct } from '../../../auth/product.decorator';
import {
  AFFECTATIONS,
  ALLOWANCE_CODES,
  CREDIT_NOTE_TYPES,
  DEBIT_NOTE_TYPES,
  DETRACTIONS,
  DOCUMENT_CODES,
  DOCUMENT_NAMES,
  IDENTITY_TYPES,
  OPERATION_TYPES,
  PAYMENT_MEANS,
  TRANSFER_REASONS,
  TRANSPORT_MODES,
  UNITS,
} from '../core/catalogs';
import { isValidDni, isValidRuc } from '../core/ruc';
import { ExchangeRateService } from './exchange-rate.service';
import { PadronService } from './padron.service';

/** Las consultas van incluidas en los planes de pago; en el plan gratis cuentan contra su cuota. */
export const lookupCost: CostFn = (req) => {
  const record = req[REQUEST_KEY_PROP] as ApiKeyRecord | undefined;
  if (!record) return 1;
  const scope = quotaScope(record, 'sunat');
  return scope.kind === 'plan' && scope.plan !== 'free' ? 0 : 1;
};

@ApiTags('sunat · consultas')
@ApiSecurity('api-key')
@ForProduct('sunat')
@Controller('sunat')
export class ConsultasController {
  constructor(
    private readonly padron: PadronService,
    private readonly exchange: ExchangeRateService,
  ) {}

  @Get('ruc/:ruc')
  @Cost(lookupCost)
  @ApiOperation({
    summary: 'Consulta RUC: razón social, estado, condición y domicilio fiscal',
    description: 'Sale del padrón reducido que SUNAT publica cada día. De las personas naturales SUNAT no publica el domicilio.',
  })
  async ruc(@Param('ruc') ruc: string) {
    if (!isValidRuc(ruc)) throw new BadRequestException('El RUC debe tener 11 dígitos y un dígito verificador válido.');
    const [found, info] = await Promise.all([this.padron.ruc(ruc), this.padron.info()]);
    if (!found) throw new NotFoundException(`El RUC ${ruc} no figura en el padrón de SUNAT.`);
    return { success: true, message: 'Datos procesados correctamente', payload: { ...found, nombre_comercial: null, actividades_economicas: null, fecha_padron: info.version } };
  }

  @Get('dni/:dni')
  @Cost(lookupCost)
  @ApiOperation({
    summary: 'Consulta DNI: nombre de la persona si tiene RUC',
    description: 'Busca en el padrón de SUNAT el RUC de persona natural de ese DNI (10 + DNI + dígito verificador). Quien nunca tuvo RUC no figura: no es una consulta a RENIEC.',
  })
  async dni(@Param('dni') dni: string) {
    if (!isValidDni(dni)) throw new BadRequestException('El DNI debe tener 8 dígitos.');
    const found = await this.padron.dni(dni);
    if (!found) throw new NotFoundException(`No hay un contribuyente con el DNI ${dni} en el padrón de SUNAT (solo figuran las personas con RUC).`);
    return {
      success: true,
      message: 'Datos procesados correctamente',
      payload: { dni, nombre_completo: found.razon_social, ruc: found.ruc, estado: found.estado, condicion: found.condicion },
    };
  }

  @Get('catalogs')
  @Cost(0)
  @ApiOperation({ summary: 'Catálogos de SUNAT que usa la API (unidades, afectación del IGV, tipos de nota, detracciones…)' })
  catalogs() {
    const list = (table: Record<string, string>) => Object.entries(table).map(([codigo, descripcion]) => ({ codigo, descripcion }));
    return {
      success: true,
      message: 'Catálogos obtenidos correctamente',
      payload: {
        documentos: Object.entries(DOCUMENT_CODES).map(([documento, codigo]) => ({ documento, codigo, descripcion: DOCUMENT_NAMES[codigo] })),
        tipos_de_documento_de_identidad: list(IDENTITY_TYPES),
        unidades_de_medida: list(UNITS),
        tipos_de_afectacion_igv: Object.entries(AFFECTATIONS).map(([codigo, a]) => ({ codigo, descripcion: a.description, nombre_tributo: a.scheme.name, gratuita: a.free })),
        tipos_de_operacion: list(OPERATION_TYPES),
        tipos_de_nota_de_credito: list(CREDIT_NOTE_TYPES),
        tipos_de_nota_de_debito: list(DEBIT_NOTE_TYPES),
        descuentos: Object.entries(ALLOWANCE_CODES).map(([codigo, a]) => ({ codigo, descripcion: a.description, nivel: a.level, afecta_base_imponible: a.affectsBase })),
        detracciones: Object.entries(DETRACTIONS).map(([codigo, d]) => ({ codigo, descripcion: d.description, porcentaje: d.percent, monto_minimo: d.minimum })),
        medios_de_pago: list(PAYMENT_MEANS),
        motivos_de_traslado: list(TRANSFER_REASONS),
        modalidades_de_transporte: list(TRANSPORT_MODES),
      },
    };
  }

  @Get(['exchange-rate', 'exchange-rate/sbs'])
  @Cost(0)
  @ApiOperation({
    summary: 'Tipo de cambio SBS (dólar y euro) de una fecha',
    description: 'Compra y venta que publica la SBS, tomadas del BCRP. Sin `date`, el último publicado; en fines de semana y feriados, el del último día hábil.',
  })
  @ApiQuery({ name: 'date', required: false, example: '2026-10-09', description: 'AAAA-MM-DD' })
  async exchangeRate(@Query('date') date?: string) {
    if (date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) throw new BadRequestException('date debe tener el formato AAAA-MM-DD.');
    if (date && date < '2000-01-01') throw new BadRequestException('Solo hay tipo de cambio desde el año 2000.');
    const rates = await this.exchange.rates(date);
    if (!Object.keys(rates).length) throw new NotFoundException(`No hay tipo de cambio publicado hasta el ${date}.`);
    return { success: true, message: 'Tipos de cambio obtenido correctamente', payload: rates };
  }
}
