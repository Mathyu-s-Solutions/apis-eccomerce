import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  type CanActivate,
  Body,
  Controller,
  Delete,
  type ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Public } from '../../auth/public.decorator';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { baseUrl } from './base-url';
import { CompaniesService } from './companies.service';
import { isValidRuc } from './core/ruc';
import { limaNow } from './core/time';
import { PadronService } from './consultas/padron.service';
import { DocumentsService } from './documents.service';
import { type CompanyDto, CompanySchema } from './dto/company.dto';
import { SaleDocumentSchema } from './dto/document.dto';
import { type DocumentsQueryDto, DocumentsQuerySchema } from './dto/operations.dto';
import { SunatValidationPipe } from './sunat-validation.pipe';

const USER_PROP = 'portalUserId';

/**
 * Solo el portal: `x-portal-secret` (PORTAL_API_SECRET) y el usuario de la
 * sesión en `x-portal-user`. El portal ya autenticó a la persona.
 */
@Injectable()
class PortalGuard implements CanActivate {
  constructor(@Inject(CONFIG_TOKEN) private readonly config: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.portal.secret;
    if (!expected) throw new NotFoundException();
    const req = ctx.switchToHttp().getRequest();
    const given = Buffer.from(String(req.headers['x-portal-secret'] ?? ''));
    const want = Buffer.from(expected);
    if (given.length !== want.length || !timingSafeEqual(given, want)) throw new UnauthorizedException();
    const userId = String(req.headers['x-portal-user'] ?? '').trim();
    if (!/^[\w-]{3,64}$/.test(userId)) throw new UnauthorizedException();
    req[USER_PROP] = userId;
    return true;
  }
}

const PortalUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest()[USER_PROP]);

/** Lo que el panel del portal necesita de la API de SUNAT: empresas, comprobantes y una prueba en beta. */
@ApiExcludeController()
@Public()
@UseGuards(PortalGuard)
@Controller('internal/portal/sunat')
export class PortalController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly documents: DocumentsService,
    private readonly padron: PadronService,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
  ) {}

  @Get('companies')
  async list(@PortalUser() userId: string) {
    return { companies: (await this.companies.list(userId)).map((c) => this.companies.view(c)) };
  }

  @Post('companies')
  @HttpCode(HttpStatus.OK)
  async upsert(@PortalUser() userId: string, @Body(new SunatValidationPipe(CompanySchema)) dto: CompanyDto) {
    return { company: this.companies.view(await this.companies.upsert(userId, dto)) };
  }

  @Delete('companies/:ruc')
  @HttpCode(HttpStatus.OK)
  async remove(@PortalUser() userId: string, @Param('ruc') ruc: string) {
    await this.companies.remove(userId, ruc);
    return { deleted: true };
  }

  @Get('companies/:ruc/documents')
  async documentsOf(@PortalUser() userId: string, @Param('ruc') ruc: string, @Req() req: FastifyRequest, @Query(new SunatValidationPipe(DocumentsQuerySchema)) q: DocumentsQueryDto) {
    const company = await this.companies.get(userId, ruc);
    const page = await this.documents.list(company, q);
    const base = baseUrl(this.config, req);
    return { paginate: page.paginate, items: page.items.map((d) => ({ ...this.documents.summary(d), ...this.documents.view(d, company.ruc, base).payload })) };
  }

  /** Emite una boleta de prueba en beta, para ver el flujo completo desde el panel. */
  @Post('companies/:ruc/test')
  @HttpCode(HttpStatus.OK)
  async test(@PortalUser() userId: string, @Param('ruc') ruc: string, @Req() req: FastifyRequest) {
    const company = await this.companies.get(userId, ruc);
    if (company.environment !== 'beta') throw new BadRequestException('La prueba es solo para empresas en beta: en producción sería un comprobante real.');
    const dto = SaleDocumentSchema.parse({
      documento: 'boleta',
      serie: 'B999',
      fecha_de_emision: limaNow().date,
      cliente_tipo_de_documento: '1',
      cliente_numero_de_documento: '99999999',
      cliente_denominacion: 'CLIENTE DE PRUEBA',
      items: [
        { descripcion: 'PRODUCTO DE PRUEBA', cantidad: '2', valor_unitario: '42.372881' },
        { descripcion: 'SERVICIO DE PRUEBA', unidad_de_medida: 'ZZ', cantidad: '1', valor_unitario: '15.254237' },
      ],
    });
    const doc = await this.documents.emit(company, dto);
    return this.documents.view(doc, company.ruc, baseUrl(this.config, req));
  }

  /** Para autocompletar el alta de una empresa con el padrón de SUNAT. */
  @Get('ruc/:ruc')
  async ruc(@Param('ruc') ruc: string) {
    if (!isValidRuc(ruc)) throw new BadRequestException('RUC inválido.');
    const found = await this.padron.ruc(ruc);
    if (!found) throw new NotFoundException(`El RUC ${ruc} no figura en el padrón de SUNAT.`);
    // Para el formulario: la calle sola, sin el departamento - provincia - distrito del final.
    const suffix = [found.departamento, found.provincia, found.distrito].filter(Boolean).join(' - ');
    const direccion = found.direccion_fiscal && suffix ? found.direccion_fiscal.replace(` ${suffix}`, '').trim() : found.direccion_fiscal;
    return { ...found, direccion };
  }
}
