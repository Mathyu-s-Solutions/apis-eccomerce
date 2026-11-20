import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Res } from '@nestjs/common';
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
  DEFAULT_PRO_ACCOUNT,
  PRO_ACCOUNT_REF,
  PRO_ACCOUNT_REF_HINT,
  SHALOM_DECLARATIONS,
  SHALOM_PACKAGES,
  ShalomProAccountSchema,
  type ShalomProAccountDto,
  ShalomShipmentSchema,
  type ShalomShipmentDto,
} from '../dto/shalom-pro.dto';
import { PRO_ACCOUNTS_LIMIT, proAccountsLimit, ShalomProService } from './shalom-pro.service';

const SHIPMENT_EXAMPLE = {
  origin: '220',
  destination: '7',
  air: false,
  package: 'xs',
  quantity: 1,
  payer: 'sender',
  recipient: { document: '12345678', name: 'MARIA', paternalSurname: 'PEREZ', maternalSurname: 'GOMEZ', phone: '987654321' },
};

/** La cuenta de Shalom Pro es del cliente del portal: hace falta una key con dueño. */
function ownerOf(key: ApiKeyRecord | undefined): string {
  if (!key?.userId) throw new ForbiddenException('Las guías de Shalom se crean con la cuenta de Shalom Pro de tu cuenta: usa una API key creada en tu panel.');
  return key.userId;
}

function accountOf(raw: string): string {
  if (!PRO_ACCOUNT_REF.test(raw)) throw new BadRequestException(PRO_ACCOUNT_REF_HINT);
  return raw;
}

const ACCOUNT_BODY = { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', example: 'ventas@mitienda.pe' }, password: { type: 'string', example: '••••••••' } } } };

function oseIdOf(raw: string): string {
  if (!/^\d{1,12}$/.test(raw)) throw new BadRequestException('oseId: el id interno de la guía (el oseId que devolvió POST /v1/shalom/shipments).');
  return raw;
}

/**
 * Guías de Shalom con la cuenta de Shalom Pro (pro.shalom.pe) del cliente: la
 * guía queda a su nombre, como si la registrara en el portal de Shalom.
 */
@ApiTags('shalom · guías')
@ApiSecurity('api-key')
@ForProduct('shalom')
@Controller('shalom')
export class ShalomProController {
  constructor(private readonly pro: ShalomProService) {}

  @Put('pro/account')
  @Cost(0)
  // Cada conexión resuelve un captcha y prueba la contraseña en Shalom.
  @Throttle({ key: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Conecta tu cuenta de Shalom Pro (para crear guías)',
    description:
      'Correo y contraseña de pro.shalom.pe. Se prueban en Shalom y se guardan cifrados; la contraseña nunca se devuelve. ' +
      'Las guías salen a nombre del titular de esa cuenta (remitente). Si cambias la contraseña en Shalom, vuelve a llamar a este endpoint.',
  })
  @ApiBody(ACCOUNT_BODY)
  connect(@CurrentKey() key: ApiKeyRecord, @Body(new ZodValidationPipe(ShalomProAccountSchema)) dto: ShalomProAccountDto) {
    return this.pro.connect(ownerOf(key), dto, DEFAULT_PRO_ACCOUNT, proAccountsLimit(key));
  }

  @Get('pro/account')
  @Cost(0)
  @ApiOperation({ summary: 'Cuenta de Shalom Pro conectada (sin la contraseña)' })
  account(@CurrentKey() key: ApiKeyRecord) {
    return this.pro.account(ownerOf(key));
  }

  @Delete('pro/account')
  @HttpCode(HttpStatus.OK)
  @Cost(0)
  @ApiOperation({ summary: 'Desconecta tu cuenta de Shalom Pro y borra sus credenciales' })
  async disconnect(@CurrentKey() key: ApiKeyRecord) {
    await this.pro.disconnect(ownerOf(key));
    return { disconnected: true };
  }

  // ─── Varias cuentas (plan Empresarial) ──────────────────────────────────────

  @Get('pro/accounts')
  @Cost(0)
  @ApiOperation({ summary: 'Cuentas de Shalom Pro conectadas (sin las contraseñas)' })
  accounts(@CurrentKey() key: ApiKeyRecord) {
    return this.pro.accounts(ownerOf(key));
  }

  @Put('pro/accounts/:account')
  @Cost(0)
  @Throttle({ key: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Conecta una cuenta de Shalom Pro con un identificador (una por negocio)',
    description:
      `\`account\` es el identificador que eliges (p. ej. el id del negocio en tu plataforma; letras, números, "_", "." o "-"). Luego lo mandas en \`account\` de POST /shipments. ` +
      `Con el plan Empresarial puedes conectar hasta ${PRO_ACCOUNTS_LIMIT.empresarial} cuentas; con los demás planes, ${PRO_ACCOUNTS_LIMIT.base}. ` +
      'Volver a llamarlo con el mismo identificador reemplaza esa cuenta. `default` es la de PUT /pro/account.',
  })
  @ApiBody(ACCOUNT_BODY)
  connectNamed(
    @CurrentKey() key: ApiKeyRecord,
    @Param('account') account: string,
    @Body(new ZodValidationPipe(ShalomProAccountSchema)) dto: ShalomProAccountDto,
  ) {
    return this.pro.connect(ownerOf(key), dto, accountOf(account), proAccountsLimit(key));
  }

  @Get('pro/accounts/:account')
  @Cost(0)
  @ApiOperation({ summary: 'Una cuenta de Shalom Pro conectada, por su identificador' })
  accountNamed(@CurrentKey() key: ApiKeyRecord, @Param('account') account: string) {
    return this.pro.account(ownerOf(key), accountOf(account));
  }

  @Delete('pro/accounts/:account')
  @HttpCode(HttpStatus.OK)
  @Cost(0)
  @ApiOperation({ summary: 'Desconecta una cuenta de Shalom Pro y borra sus credenciales' })
  async disconnectNamed(@CurrentKey() key: ApiKeyRecord, @Param('account') account: string) {
    const ref = accountOf(account);
    await this.pro.disconnect(ownerOf(key), ref);
    return { account: ref, disconnected: true };
  }

  @Post('shipments')
  @HttpCode(HttpStatus.CREATED)
  @Cost(1)
  @Throttle({ key: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Crea una guía de Shalom con tu cuenta de Shalom Pro',
    description:
      'Registra el envío como el formulario "Envía ya" de pro.shalom.pe: el remitente es el titular de tu cuenta y el pago es en la agencia ' +
      '(`payer: "sender"`, al dejar el paquete) o al recoger (`payer: "recipient"`). `origin` y `destination` son el `code` de GET /agencies; ' +
      `\`package\`: ${SHALOM_PACKAGES.join(', ')} (\`custom\` = otra medida, con \`weightKg\` o las tres medidas en cm). ` +
      'Si Shalom ya tiene al destinatario por su documento, usa los datos que tiene registrados. `securityCode` (4 dígitos) es la clave para recoger: si no la mandas se genera una. ' +
      `\`declaration\` (${Object.keys(SHALOM_DECLARATIONS).join(', ')}) va con \`referralGuides\` y solo para persona natural. ` +
      'Con varias cuentas conectadas (plan Empresarial), `account` dice con cuál se crea. ' +
      'Devuelve `orderNumber` + `orderCode` (sirven para POST /track sin gastar captcha), `oseId`, el precio y las rutas del rótulo y del ticket en PDF.',
  })
  @ApiQuery({ name: 'raw', required: false, enum: ['1', '0'], description: 'Incluye la respuesta cruda de Shalom Pro.' })
  @ApiBody({ schema: { type: 'object', required: ['origin', 'destination', 'package', 'recipient'], example: SHIPMENT_EXAMPLE } })
  async create(
    @CurrentKey() key: ApiKeyRecord,
    @Body(new ZodValidationPipe(ShalomShipmentSchema)) dto: ShalomShipmentDto,
    @Query(new ZodValidationPipe(RawQuerySchema)) query: RawQueryDto,
  ) {
    return withRaw(await this.pro.createShipment(ownerOf(key), dto, proAccountsLimit(key)), query.raw);
  }

  @Get('shipments/:oseId/label')
  @Cost(0)
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Rótulo en PDF de una guía de tu cuenta (para pegar en la caja)', description: 'Se pide con la cuenta de Shalom Pro con la que se creó la guía: no hace falta mandar `account`.' })
  async label(@CurrentKey() key: ApiKeyRecord, @Param('oseId') oseId: string, @Res() res: FastifyReply) {
    const id = oseIdOf(oseId);
    const file = await this.pro.document(ownerOf(key), id, 'label');
    return res.header('content-type', file.contentType).header('content-disposition', `inline; filename="rotulo-${id}.pdf"`).header('cache-control', 'private, no-store').send(file.data);
  }

  @Get('shipments/:oseId/ticket')
  @Cost(0)
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Ticket en PDF de una guía de tu cuenta (comprobante del envío)', description: 'Se pide con la cuenta de Shalom Pro con la que se creó la guía: no hace falta mandar `account`.' })
  async ticket(@CurrentKey() key: ApiKeyRecord, @Param('oseId') oseId: string, @Res() res: FastifyReply) {
    const id = oseIdOf(oseId);
    const file = await this.pro.document(ownerOf(key), id, 'ticket');
    return res.header('content-type', file.contentType).header('content-disposition', `inline; filename="ticket-${id}.pdf"`).header('cache-control', 'private, no-store').send(file.data);
  }
}
