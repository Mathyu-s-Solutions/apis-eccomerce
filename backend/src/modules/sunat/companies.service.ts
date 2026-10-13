import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type SunatCompany } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import type { CompanyDto } from './dto/company.dto';
import { SunatInputError } from './errors';
import { SecretBox } from './secret-box';
import { type CertificateInfo, type SigningCertificate, certificateInfo, parseCertificate } from './signing/certificate';
import { testCertificate } from './signing/test-certificate';
import { BETA_SOL, type SolCredentials, type SunatEnvironment } from './transport/bill-service';
import type { Issuer } from './ubl/model';

/** Empresas emisoras por cuenta. */
export const MAX_COMPANIES = 10;

/** Con qué se firma y se envía a SUNAT en nombre de una empresa. */
export interface Sender {
  environment: SunatEnvironment;
  sol: SolCredentials;
  certificate: SigningCertificate;
}

export interface ApiCredentials {
  clientId: string;
  clientSecret: string;
  sol: SolCredentials;
}

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
  ) {}

  private db(): PrismaService {
    if (!this.prisma.enabled) throw new ServiceUnavailableException('La API de SUNAT necesita la base de datos (DATABASE_URL).');
    return this.prisma;
  }

  list(userId: string): Promise<SunatCompany[]> {
    return this.db().sunatCompany.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }

  async get(userId: string, ruc: string): Promise<SunatCompany> {
    const company = await this.db().sunatCompany.findUnique({ where: { userId_ruc: { userId, ruc } } });
    if (!company) throw new NotFoundException(`No tienes registrada la empresa con RUC ${ruc}. Regístrala con POST /v1/sunat/companies.`);
    return company;
  }

  /** La empresa de la request: la del RUC indicado o, si la cuenta tiene una sola, esa. */
  async resolve(userId: string, ruc?: string): Promise<SunatCompany> {
    if (ruc) return this.get(userId, ruc);
    const companies = await this.list(userId);
    if (companies.length === 1) return companies[0];
    if (!companies.length) throw new SunatInputError('Primero registra tu empresa emisora: POST /v1/sunat/companies con tu RUC, razón social y dirección.');
    throw new SunatInputError(`Tu cuenta tiene ${companies.length} empresas: indica el RUC del emisor en la cabecera x-ruc.`, { rucs: companies.map((c) => c.ruc) });
  }

  async upsert(userId: string, dto: CompanyDto): Promise<SunatCompany> {
    const db = this.db();
    const existing = await db.sunatCompany.findUnique({ where: { userId_ruc: { userId, ruc: dto.ruc } } });
    if (!existing) {
      if (!dto.razon_social || !dto.direccion) throw new SunatInputError('Para registrar la empresa hacen falta razon_social y direccion.');
      if ((await db.sunatCompany.count({ where: { userId } })) >= MAX_COMPANIES) throw new ConflictException(`Tu cuenta admite hasta ${MAX_COMPANIES} empresas.`);
    }

    const data: Prisma.SunatCompanyUncheckedUpdateInput = {};
    const set = <K extends keyof Prisma.SunatCompanyUncheckedUpdateInput>(key: K, value: Prisma.SunatCompanyUncheckedUpdateInput[K] | undefined) => {
      if (value !== undefined) data[key] = value;
    };
    set('razonSocial', dto.razon_social);
    set('direccion', dto.direccion);
    set('nombreComercial', dto.nombre_comercial);
    set('ubigeo', dto.ubigeo);
    set('departamento', dto.departamento?.toUpperCase());
    set('provincia', dto.provincia?.toUpperCase());
    set('distrito', dto.distrito?.toUpperCase());
    set('urbanizacion', dto.urbanizacion);
    set('telefono', dto.telefono);
    set('email', dto.email);
    set('solUser', dto.sol_usuario);
    set('apiClientId', dto.api_client_id);
    if (dto.sol_clave !== undefined) data.solPassword = dto.sol_clave ? this.secrets.seal(dto.sol_clave) : null;
    if (dto.api_client_secret !== undefined) data.apiClientSecret = dto.api_client_secret ? this.secrets.seal(dto.api_client_secret) : null;

    if (dto.certificado === null) {
      data.certificate = null;
      data.certificateInfo = Prisma.DbNull;
    } else if (dto.certificado) {
      const file = dto.certificado.includes('-----BEGIN') ? Buffer.from(dto.certificado, 'utf8') : Buffer.from(dto.certificado.replace(/^data:[^,]*,/, '').replace(/\s+/g, ''), 'base64');
      const cert = parseCertificate(file, dto.certificado_clave ?? '');
      const info = certificateInfo(cert.certificatePem);
      if (new Date(info.validTo) < new Date()) throw new SunatInputError(`El certificado venció el ${info.validTo.slice(0, 10)}.`);
      if (info.ruc && info.ruc !== dto.ruc) throw new SunatInputError(`El certificado es del RUC ${info.ruc}, no de ${dto.ruc}.`);
      data.certificate = this.secrets.seal(JSON.stringify(cert));
      data.certificateInfo = info as unknown as Prisma.InputJsonValue;
    }

    if (dto.logo === null) {
      data.logo = null;
      data.logoMime = null;
    } else if (dto.logo) {
      const logo = Buffer.from(dto.logo, 'base64');
      const mime = logo.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'image/png' : logo[0] === 0xff && logo[1] === 0xd8 ? 'image/jpeg' : null;
      if (!mime) throw new SunatInputError('logo debe ser una imagen PNG o JPG.');
      data.logo = logo;
      data.logoMime = mime;
    }

    const merged = { ...existing, ...data } as SunatCompany;
    const environment = dto.ambiente ?? existing?.environment ?? 'beta';
    if (environment === 'produccion') {
      const missing = missingForProduction(merged);
      if (missing.length) throw new SunatInputError(`Para pasar a producción falta: ${missing.join(', ')}.`, { faltantes: missing });
    }
    data.environment = environment;

    if (existing) return db.sunatCompany.update({ where: { id: existing.id }, data });
    return db.sunatCompany.create({
      data: { ...(data as Prisma.SunatCompanyUncheckedCreateInput), userId, ruc: dto.ruc, razonSocial: dto.razon_social!, direccion: dto.direccion! },
    });
  }

  /** Borra una empresa que no tenga comprobantes de producción (los de beta se van con ella). */
  async remove(userId: string, ruc: string): Promise<void> {
    const db = this.db();
    const company = await this.get(userId, ruc);
    const real = await db.sunatDocument.count({ where: { companyId: company.id, environment: 'produccion' } });
    if (real) throw new ConflictException(`La empresa tiene ${real} comprobantes de producción: no se puede borrar.`);
    await db.$transaction([db.sunatDocument.deleteMany({ where: { companyId: company.id } }), db.sunatCompany.delete({ where: { id: company.id } })]);
  }

  issuer(company: SunatCompany): Issuer {
    return {
      ruc: company.ruc,
      razonSocial: company.razonSocial,
      nombreComercial: company.nombreComercial,
      direccion: company.direccion,
      ubigeo: company.ubigeo,
      departamento: company.departamento,
      provincia: company.provincia,
      distrito: company.distrito,
      urbanizacion: company.urbanizacion,
      codigoAnexo: '0000',
    };
  }

  /**
   * Credenciales para emitir. En beta se usa el usuario de pruebas de SUNAT y,
   * si la empresa no subió certificado, uno de pruebas: se puede probar sin nada.
   */
  sender(company: SunatCompany): Sender {
    const environment = company.environment as SunatEnvironment;
    const own = company.certificate ? (JSON.parse(this.secrets.open(company.certificate)) as SigningCertificate) : null;
    if (environment === 'beta') {
      return { environment, sol: { ruc: company.ruc, ...BETA_SOL }, certificate: own ?? testCertificate() };
    }
    const missing = missingForProduction(company);
    if (missing.length || !own) throw new SunatInputError(`La empresa ${company.ruc} está en producción pero le falta: ${missing.join(', ')}.`);
    const info = company.certificateInfo as unknown as CertificateInfo | null;
    if (info && new Date(info.validTo) < new Date()) throw new SunatInputError(`El certificado digital de ${company.ruc} venció el ${info.validTo.slice(0, 10)}: sube el nuevo.`);
    return { environment, sol: { ruc: company.ruc, user: company.solUser!, password: this.secrets.open(company.solPassword!) }, certificate: own };
  }

  /** Credenciales de la API REST de SUNAT (guías de remisión, SIRE, validez). */
  apiCredentials(company: SunatCompany): ApiCredentials {
    if (!company.apiClientId || !company.apiClientSecret || !company.solUser || !company.solPassword) {
      throw new SunatInputError(
        `Esta operación usa las credenciales de API de SUNAT de ${company.ruc}: registra api_client_id y api_client_secret (se generan en SUNAT Operaciones en Línea → Empresas → Credenciales de API SUNAT) junto con sol_usuario y sol_clave.`,
      );
    }
    return {
      clientId: company.apiClientId,
      clientSecret: this.secrets.open(company.apiClientSecret),
      sol: { ruc: company.ruc, user: company.solUser, password: this.secrets.open(company.solPassword) },
    };
  }

  /** Lo que se devuelve de una empresa: nunca las credenciales. */
  view(company: SunatCompany) {
    const info = company.certificateInfo as unknown as CertificateInfo | null;
    const missing = missingForProduction(company);
    return {
      ruc: company.ruc,
      razon_social: company.razonSocial,
      nombre_comercial: company.nombreComercial,
      direccion: company.direccion,
      ubigeo: company.ubigeo,
      departamento: company.departamento,
      provincia: company.provincia,
      distrito: company.distrito,
      urbanizacion: company.urbanizacion,
      telefono: company.telefono,
      email: company.email,
      ambiente: company.environment,
      sol_usuario: company.solUser,
      tiene_sol_clave: !!company.solPassword,
      certificado: info ? { titular: info.subject, emisor: info.issuer, valido_desde: info.validFrom, valido_hasta: info.validTo, vencido: new Date(info.validTo) < new Date() } : null,
      api_client_id: company.apiClientId,
      tiene_api_client_secret: !!company.apiClientSecret,
      tiene_logo: !!company.logo,
      listo_para_produccion: missing.length === 0,
      faltantes_para_produccion: missing,
      creado: company.createdAt,
      actualizado: company.updatedAt,
    };
  }
}

/** Qué le falta a una empresa para emitir comprobantes reales. */
export function missingForProduction(company: Pick<SunatCompany, 'solUser' | 'solPassword' | 'certificate'>): string[] {
  const missing: string[] = [];
  if (!company.solUser) missing.push('sol_usuario (usuario secundario SOL)');
  if (!company.solPassword) missing.push('sol_clave');
  if (!company.certificate) missing.push('certificado (certificado digital .pfx/.p12)');
  return missing;
}
