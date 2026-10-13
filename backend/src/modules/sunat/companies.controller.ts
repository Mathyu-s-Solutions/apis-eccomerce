import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { ApiKeyRecord } from '../../auth/api-key.store';
import { CurrentKey } from '../../auth/current-key.decorator';
import { ForProduct } from '../../auth/product.decorator';
import { CompaniesService } from './companies.service';
import { ownerOf } from './company.guard';
import { type CompanyDto, CompanySchema } from './dto/company.dto';
import { SunatValidationPipe } from './sunat-validation.pipe';

const EXAMPLE = {
  ruc: '20123456789',
  razon_social: 'MI EMPRESA S.A.C.',
  nombre_comercial: 'MI EMPRESA',
  direccion: 'AV. LOS OLIVOS 123',
  ubigeo: '150101',
  departamento: 'LIMA',
  provincia: 'LIMA',
  distrito: 'LIMA',
  ambiente: 'beta',
};

/**
 * Empresas emisoras de la cuenta. Una empresa nueva queda en `beta` y puede
 * emitir de inmediato contra SUNAT beta. Para `produccion` necesita su usuario
 * secundario SOL y su certificado digital.
 */
@ApiTags('sunat · empresas')
@ApiSecurity('api-key')
@ForProduct('sunat')
@Controller('sunat/companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @ApiOperation({ summary: 'Empresas emisoras de tu cuenta' })
  async list(@CurrentKey() key: ApiKeyRecord) {
    const companies = await this.companies.list(ownerOf(key));
    return { success: true, message: 'Empresas obtenidas correctamente', payload: companies.map((c) => this.companies.view(c)) };
  }

  @Get(':ruc')
  @ApiOperation({ summary: 'Datos de una empresa (sin sus credenciales)' })
  async get(@CurrentKey() key: ApiKeyRecord, @Param('ruc') ruc: string) {
    return { success: true, message: 'Empresa obtenida correctamente', payload: this.companies.view(await this.companies.get(ownerOf(key), ruc)) };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Registra una empresa o cambia sus datos',
    description:
      'Lo que no mandas no cambia. Credenciales (se guardan cifradas y nunca se devuelven): `sol_usuario` y `sol_clave` (usuario secundario SOL), ' +
      '`certificado` (.pfx/.p12 en base64 o PEM) con `certificado_clave`, y `api_client_id` / `api_client_secret` (credenciales de API de SUNAT, para guías de remisión y SIRE). ' +
      'Con todo cargado, `ambiente: "produccion"` empieza a emitir comprobantes reales.',
  })
  @ApiBody({ schema: { type: 'object', example: EXAMPLE } })
  async upsert(@CurrentKey() key: ApiKeyRecord, @Body(new SunatValidationPipe(CompanySchema)) dto: CompanyDto) {
    const company = await this.companies.upsert(ownerOf(key), dto);
    return { success: true, message: `Empresa ${company.ruc} guardada (ambiente: ${company.environment}).`, payload: this.companies.view(company) };
  }

  @Delete(':ruc')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borra una empresa sin comprobantes de producción' })
  async remove(@CurrentKey() key: ApiKeyRecord, @Param('ruc') ruc: string) {
    await this.companies.remove(ownerOf(key), ruc);
    return { success: true, message: `Empresa ${ruc} eliminada.` };
  }
}
