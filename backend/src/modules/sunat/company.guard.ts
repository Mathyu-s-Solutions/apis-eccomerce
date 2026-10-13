import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, createParamDecorator } from '@nestjs/common';
import type { SunatCompany } from '../../../generated/prisma';
import type { ApiKeyRecord } from '../../auth/api-key.store';
import { REQUEST_KEY_PROP } from '../../auth/current-key.decorator';
import type { CostFn } from '../../auth/cost.decorator';
import { CompaniesService } from './companies.service';
import { isValidRuc } from './core/ruc';
import { SunatInputError } from './errors';

const COMPANY_PROP = 'sunatCompany';
const HEADER = 'x-ruc';

/** Las empresas y sus comprobantes son de una cuenta del portal. */
export function ownerOf(record: ApiKeyRecord | undefined): string {
  if (!record?.userId) throw new ForbiddenException('La API de SUNAT trabaja con las empresas de tu cuenta: usa una API key creada en tu panel.');
  return record.userId;
}

/**
 * Resuelve la empresa emisora de la request: la de la cabecera `x-ruc` o, si
 * la cuenta tiene una sola, esa. La deja en la request para el handler y la cuota.
 */
@Injectable()
export class CompanyGuard implements CanActivate {
  constructor(private readonly companies: CompaniesService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const userId = ownerOf(req[REQUEST_KEY_PROP]);
    const raw = req.headers[HEADER];
    const ruc = (Array.isArray(raw) ? raw[0] : raw)?.trim() || undefined;
    if (ruc && !isValidRuc(ruc)) throw new SunatInputError(`La cabecera ${HEADER} no trae un RUC válido.`);
    req[COMPANY_PROP] = await this.companies.resolve(userId, ruc);
    return true;
  }
}

/** La empresa emisora de la request (la pone CompanyGuard). */
export const Company = createParamDecorator((_data: unknown, ctx: ExecutionContext): SunatCompany => ctx.switchToHttp().getRequest()[COMPANY_PROP]);

/** En beta no se cobra: solo consumen cuota los comprobantes de producción. */
export const productionCost: CostFn = (req) => ((req[COMPANY_PROP] as SunatCompany | undefined)?.environment === 'produccion' ? 1 : 0);
