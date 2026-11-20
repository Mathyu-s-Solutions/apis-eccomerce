import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiProduces, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import type { ApiKeyRecord } from '../../../auth/api-key.store';
import { Cost } from '../../../auth/cost.decorator';
import { CurrentKey } from '../../../auth/current-key.decorator';
import { ForProduct } from '../../../auth/product.decorator';
import { RawQuerySchema, type RawQueryDto, withRaw } from '../../../common/courier/raw-query';
import { ZodValidationPipe } from '../../../common/zod/zod-validation.pipe';
import {
  OLVA_MAX_DECLARED_VALUE,
  OlvaDestinationsQuerySchema,
  type OlvaDestinationsQueryDto,
  OlvaShipmentSchema,
  type OlvaShipmentDto,
} from '../dto/olva-shipment.dto';
import { OlvaShipmentsService } from './olva-shipments.service';

const EXAMPLE = {
  origin: '43',
  payment: 'pagoefectivo',
  sender: { documentType: 'ruc', document: '20123456789', firstNames: 'MI TIENDA SAC', phone: '987654321', email: 'ventas@mitienda.pe' },
  recipient: { documentType: 'dni', document: '12345678', firstNames: 'MARIA', lastName: 'PEREZ GOMEZ', phone: '912345678' },
  destination: { type: 'store', officeId: '500' },
  package: { weightKg: 1.5, lengthCm: 30, widthCm: 20, heightCm: 10, categoryId: 227, declaredValue: 120 },
};

/** Los envíos y su rótulo son de una cuenta del portal: hace falta una key con dueño. */
function ownerOf(key: ApiKeyRecord | undefined): string {
  if (!key?.userId) throw new ForbiddenException('Los envíos de Olva se guardan en tu cuenta: usa una API key creada en tu panel.');
  return key.userId;
}

/**
 * Envíos de Olva por el registro web de Olva (registrodeenvios.olvacourier.com).
 * No necesita cuenta de Olva: se paga en la tienda, paga el destinatario o se paga un código de PagoEfectivo.
 */
@ApiTags('olva · envíos')
@ApiSecurity('api-key')
@ForProduct('olva')
@Controller('olva/shipments')
export class OlvaShipmentsController {
  constructor(private readonly shipments: OlvaShipmentsService) {}

  @Get('origins')
  @Cost(0)
  @ApiOperation({
    summary: 'Sedes de origen de Olva (desde dónde se envía) y cómo se puede pagar en cada una',
    description: '`payments`: `store` (pagas al dejarlo en la tienda), `destination` (paga el destinatario) y `pagoefectivo` (pagas un código CIP antes de dejarlo). Lima solo acepta `destination` y `pagoefectivo`.',
  })
  origins() {
    return this.shipments.origins();
  }

  @Get('destinations')
  @Cost(0)
  @ApiOperation({
    summary: 'Tiendas de recojo o distritos con entrega a domicilio desde una sede',
    description: '`type=store` devuelve tiendas (`officeId`); `type=home`, distritos (`ubigeo`). Dependen de la sede de origen y de quién paga (`payment`). Filtros: q, department, province, district; `limit` hasta 500.',
  })
  destinations(@Query(new ZodValidationPipe(OlvaDestinationsQuerySchema)) q: OlvaDestinationsQueryDto) {
    return this.shipments.destinations(q);
  }

  @Get('categories')
  @Cost(0)
  @ApiOperation({ summary: 'Categorías de contenido (categoryId del paquete)' })
  categories() {
    return this.shipments.categories();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Cost(1)
  // Cada envío resuelve ~10 captchas (uno por paso del registro de Olva).
  @Throttle({ key: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Registra un envío de Olva (pedido de preventa con rótulo)',
    description:
      'Hace lo mismo que registrodeenvios.olvacourier.com: remitente, sede de origen (`origin`), cómo se paga (`payment`: `store`, `destination` o `pagoefectivo`), destinatario, ' +
      'destino (`store` con `officeId` o `home` con ubigeo, dirección y referencia) y paquete (peso y medidas en cm, `categoryId`, ' +
      `\`declaredValue\` hasta S/ ${OLVA_MAX_DECLARED_VALUE}). Si el destino es una tienda, \`pin\` es la clave de 4 dígitos para recogerlo (si no la mandas, se genera). ` +
      'Devuelve `orderNumber` (N° de registro), `tracking` (sirve tal cual para POST /v1/olva/track y los webhooks, cuando Olva recibe el paquete), `cartId`, el total, la ruta del rótulo en PDF y, con `pagoefectivo`, el código CIP y su enlace de pago (`pagoEfectivo`). Después deja el paquete en una tienda de Olva.',
  })
  @ApiQuery({ name: 'raw', required: false, enum: ['1', '0'], description: 'Incluye la respuesta cruda de Olva.' })
  @ApiBody({ schema: { type: 'object', required: ['origin', 'payment', 'sender', 'recipient', 'destination', 'package'], example: EXAMPLE } })
  async create(
    @CurrentKey() key: ApiKeyRecord,
    @Body(new ZodValidationPipe(OlvaShipmentSchema)) dto: OlvaShipmentDto,
    @Query(new ZodValidationPipe(RawQuerySchema)) query: RawQueryDto,
  ) {
    return withRaw(await this.shipments.createShipment(ownerOf(key), dto), query.raw);
  }

  @Get(':cartId/label')
  @Cost(0)
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Rótulo en PDF de un envío de Olva creado con tu cuenta' })
  async label(@CurrentKey() key: ApiKeyRecord, @Param('cartId') cartId: string, @Res() res: FastifyReply) {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(cartId)) throw new BadRequestException('cartId: el que devolvió POST /v1/olva/shipments.');
    const file = await this.shipments.label(ownerOf(key), cartId);
    return res
      .header('content-type', 'application/pdf')
      .header('content-disposition', `inline; filename="${file.filename.replace(/[^\w.-]/g, '_')}"`)
      .header('cache-control', 'private, no-store')
      .send(file.data);
  }
}
