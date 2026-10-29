import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import type { SunatCompany } from '../../../generated/prisma';
import { API_KEY_STORE, type ApiKeyRecord, type ApiKeyStore } from '../../auth/api-key.store';
import { Cost } from '../../auth/cost.decorator';
import { CurrentKey } from '../../auth/current-key.decorator';
import { ForProduct } from '../../auth/product.decorator';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { baseUrl } from './base-url';
import { Company, CompanyGuard, productionCost } from './company.guard';
import { DocumentsService } from './documents.service';
import { type DespatchDto, DespatchSchema } from './dto/despatch.dto';
import { type SaleDocumentDto, SaleDocumentSchema } from './dto/document.dto';
import { type DailySummaryDto, DailySummarySchema, type DocumentsQueryDto, DocumentsQuerySchema, type StatusDto, StatusSchema, type VoidedDto, VoidedSchema } from './dto/operations.dto';
import { SunatValidationPipe } from './sunat-validation.pipe';

const RUC_HEADER = { name: 'x-ruc', required: false, description: 'RUC de la empresa emisora. Solo hace falta si tu cuenta tiene más de una.' } as const;

const FACTURA_EXAMPLE = {
  documento: 'factura',
  serie: 'F001',
  numero: 123,
  fecha_de_emision: '2026-10-12',
  moneda: 'PEN',
  tipo_operacion: '0101',
  cliente_tipo_de_documento: '6',
  cliente_numero_de_documento: '20123456789',
  cliente_denominacion: 'EMPRESA DE SERVICIOS S.A.C',
  cliente_direccion: 'AV. SAN MARTIN - LIMA',
  items: [{ unidad_de_medida: 'NIU', descripcion: 'Nombre del producto', cantidad: '2', valor_unitario: '254.237288', porcentaje_igv: '18', codigo_tipo_afectacion_igv: '10', nombre_tributo: 'IGV' }],
  total: '600.00',
};

const GUIA_EXAMPLE = {
  documento: 'guia_remision_remitente',
  serie: 'T001',
  numero: 1,
  fecha_de_emision: '2026-10-12',
  motivo_de_traslado: '01',
  modalidad_de_transporte: '02',
  fecha_inicio_de_traslado: '2026-10-12',
  destinatario_tipo_de_documento: '6',
  destinatario_numero_de_documento: '20609286696',
  destinatario_denominacion: 'EMPRESA SOCIEDAD ANONIMA CERRADA',
  punto_de_partida_ubigeo: '150132',
  punto_de_partida_direccion: 'AV. LURIGANCHO NRO. 626 - SAN JUAN DE LURIGANCHO',
  punto_de_llegada_ubigeo: '150122',
  punto_de_llegada_direccion: 'Cal. General Mendiburu Nro. 855',
  peso_bruto_total: '1.9',
  peso_bruto_unidad_de_medida: 'KGM',
  numero_de_bultos: 1,
  items: [{ codigo_interno: 'P002', descripcion: 'DISCO DE MOLEDORA 18', unidad_de_medida: 'NIU', cantidad: 1 }],
  conductores: [{ conductor: 'principal', tipo_de_documento: '1', numero_de_documento: '47101979', nombres: 'JUAN VINICIO', apellidos: 'GONZALES MACEDO', numero_licencia_conducir: 'Q43101919' }],
  vehiculos: [{ vehiculo: 'principal', numero_de_placa: 'F6Y931' }],
};

/** Cada envío es una llamada a SUNAT: 120 por minuto por key. */
const SENDS_PER_MINUTE = { key: { limit: 120, ttl: 60_000 } };

const isDespatch = (body: unknown): boolean => typeof (body as { documento?: unknown } | null)?.documento === 'string' && String((body as { documento: string }).documento).startsWith('guia_remision');

/**
 * Facturación electrónica. El JSON es el de apisunat.pe: quien venga de ahí
 * cambia la URL y la key. Cada empresa trabaja en `beta` (pruebas, sin costo)
 * hasta que sube su certificado y pasa a `produccion`.
 */
@ApiTags('sunat')
@ApiSecurity('api-key')
@ApiHeader(RUC_HEADER)
@ForProduct('sunat')
@UseGuards(CompanyGuard)
@Controller('sunat')
export class SunatController {
  constructor(
    private readonly documents: DocumentsService,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
    @Inject(API_KEY_STORE) private readonly store: ApiKeyStore,
  ) {}

  /**
   * Un comprobante que SUNAT rechazó no existe, y uno repetido con la misma Idempotency-Key ya se cobró: ninguno gasta
   * cuota (la unidad que se reservó al entrar se devuelve).
   */
  private async respond(doc: Awaited<ReturnType<DocumentsService['emit']>>, company: SunatCompany, key: ApiKeyRecord, req: FastifyRequest) {
    if ((doc.status === 'RECHAZADO' || doc.replayed) && doc.environment === 'produccion') await this.store.refund(key, 1, 'sunat').catch(() => undefined);
    return this.documents.view(doc, company.ruc, baseUrl(this.config, req));
  }

  @Post('documents')
  @HttpCode(HttpStatus.OK)
  @Throttle(SENDS_PER_MINUTE)
  @Cost(productionCost)
  @ApiOperation({
    summary: 'Emite una factura, boleta, nota de crédito o nota de débito',
    description:
      'Calcula el comprobante, lo firma, lo envía a SUNAT y devuelve el estado con los enlaces al XML, el CDR y el PDF. ' +
      'Sin `numero` usa el siguiente correlativo de la serie. En `beta` no consume cuota. ' +
      'Cada ítem lleva `valor_unitario` (sin IGV) o `precio_unitario` (con IGV: el total del ítem es exacto precio × cantidad). ' +
      'Con la cabecera `Idempotency-Key`, repetir el mismo pedido (p. ej. tras un corte de red) devuelve el mismo comprobante sin emitir otro ni cobrarlo dos veces.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Clave única del pedido (hasta 100 caracteres: letras, números, - _ : .). La misma clave devuelve el mismo comprobante.' })
  @ApiBody({ schema: { type: 'object', example: FACTURA_EXAMPLE } })
  async emit(
    @Company() company: SunatCompany,
    @CurrentKey() key: ApiKeyRecord,
    @Req() req: FastifyRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    // Las guías también entran por aquí: el esquema sale del campo `documento`.
    if (isDespatch(body)) return this.dispatch(company, key, req, new SunatValidationPipe(DespatchSchema).transform(body) as DespatchDto);
    const dto = new SunatValidationPipe(SaleDocumentSchema).transform(body) as SaleDocumentDto;
    const idempotencyKey = idempotencyHeader?.trim() || undefined;
    if (idempotencyKey && !/^[\w:.-]{1,100}$/.test(idempotencyKey)) throw new BadRequestException('Idempotency-Key admite hasta 100 caracteres: letras, números, - _ : .');
    if (idempotencyKey) {
      const prior = await this.documents.replay(company, idempotencyKey, dto);
      if (prior) return this.respond({ ...prior, replayed: true }, company, key, req);
    }
    const doc = await this.documents.emit(company, dto, { hold: dto.enviar_en_resumen, idempotencyKey });
    return this.respond(doc, company, key, req);
  }

  @Post('dispatches')
  @HttpCode(HttpStatus.OK)
  @Throttle(SENDS_PER_MINUTE)
  @Cost(productionCost)
  @ApiOperation({
    summary: 'Emite una guía de remisión electrónica (remitente o transportista)',
    description:
      '`documento`: `guia_remision_remitente` (serie T…) o `guia_remision_transportista` (serie V…). En producción usa las credenciales de API de SUNAT de la empresa (`api_client_id` y `api_client_secret`).',
  })
  @ApiBody({ schema: { type: 'object', example: GUIA_EXAMPLE } })
  async dispatch(@Company() company: SunatCompany, @CurrentKey() key: ApiKeyRecord, @Req() req: FastifyRequest, @Body(new SunatValidationPipe(DespatchSchema)) dto: DespatchDto) {
    return this.respond(await this.documents.emitDespatch(company, dto), company, key, req);
  }

  @Post('voided')
  @HttpCode(HttpStatus.OK)
  @Throttle(SENDS_PER_MINUTE)
  @Cost(productionCost)
  @ApiOperation({
    summary: 'Comunica la baja de una factura o de su nota',
    description: 'Anula comprobantes aceptados (los de una misma fecha de emisión van juntos). Una boleta se anula con un resumen diario: si mandas una, se hace solo.',
  })
  @ApiBody({ schema: { type: 'object', example: { motivo: 'ANULACIÓN DE OPERACIÓN', documento_afectado: { documento: 'factura', serie: 'F001', numero: 192 } } } })
  async voided(@Company() company: SunatCompany, @CurrentKey() key: ApiKeyRecord, @Req() req: FastifyRequest, @Body(new SunatValidationPipe(VoidedSchema)) dto: VoidedDto) {
    return this.respond(await this.documents.void(company, dto), company, key, req);
  }

  @Post('daily-summary')
  @HttpCode(HttpStatus.OK)
  @Throttle(SENDS_PER_MINUTE)
  @Cost(productionCost)
  @ApiOperation({
    summary: 'Resumen diario de boletas: anularlas o informarlas en bloque',
    description: '`accion_resumen`: `anular` (por defecto), `adicionar` (boletas emitidas con `enviar_en_resumen`) o `modificar`.',
  })
  @ApiBody({ schema: { type: 'object', example: { documento: 'resumen_diario', documentos_afectados: [{ documento: 'boleta', serie: 'B001', numero: 1, accion_resumen: 'anular' }] } } })
  async dailySummary(@Company() company: SunatCompany, @CurrentKey() key: ApiKeyRecord, @Req() req: FastifyRequest, @Body(new SunatValidationPipe(DailySummarySchema)) dto: DailySummaryDto) {
    return this.respond(await this.documents.dailySummary(company, dto), company, key, req);
  }

  @Post('status')
  @HttpCode(HttpStatus.OK)
  @Cost(0)
  @ApiOperation({ summary: 'Estado de un comprobante con sus enlaces (XML firmado, CDR, PDF)', description: 'Si quedó PENDIENTE, vuelve a consultarle a SUNAT en el momento.' })
  @ApiBody({ schema: { type: 'object', example: { documento: 'factura', serie: 'F001', numero: 123 } } })
  async status(@Company() company: SunatCompany, @Req() req: FastifyRequest, @Body(new SunatValidationPipe(StatusSchema)) dto: StatusDto) {
    return this.documents.view(await this.documents.status(company, dto), company.ruc, baseUrl(this.config, req));
  }

  @Get('documents')
  @Cost(0)
  @ApiOperation({ summary: 'Lista los comprobantes emitidos por la empresa (del más reciente al más antiguo)' })
  async list(@Company() company: SunatCompany, @Req() req: FastifyRequest, @Query(new SunatValidationPipe(DocumentsQuerySchema)) query: DocumentsQueryDto) {
    const page = await this.documents.list(company, query);
    const base = baseUrl(this.config, req);
    return {
      success: true,
      message: 'Comprobantes obtenidos correctamente',
      payload: { paginate: page.paginate, items: page.items.map((d) => ({ ...this.documents.summary(d), ...this.documents.view(d, company.ruc, base).payload })) },
    };
  }
}
