import { BadRequestException, Injectable } from '@nestjs/common';
import type { SunatCompany } from '../../../../generated/prisma';
import { CompaniesService } from '../companies.service';
import type { ValidityDto } from '../dto/consultas.dto';
import { SunatFault, SunatUnavailable } from '../transport/bill-service';
import { SCOPES, SunatRestClient, restError } from '../transport/sunat-rest';

const API = 'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes';

/** Códigos del manual de la consulta integrada de SUNAT. */
const CP_STATES: Record<string, string> = { '0': 'NO EXISTE', '1': 'ACEPTADO', '2': 'ANULADO', '3': 'AUTORIZADO', '4': 'NO AUTORIZADO' };
const RUC_STATES: Record<string, string> = {
  '00': 'ACTIVO',
  '01': 'BAJA PROVISIONAL',
  '02': 'BAJA PROV. POR OFICIO',
  '03': 'SUSPENSION TEMPORAL',
  '10': 'BAJA DEFINITIVA',
  '11': 'BAJA DE OFICIO',
  '22': 'INHABILITADO-VENT.UNICA',
};
const DOMICILE: Record<string, string> = { '00': 'HABIDO', '09': 'PENDIENTE', '11': 'POR VERIFICAR', '12': 'NO HABIDO', '20': 'NO HALLADO' };

const describe = (table: Record<string, string>, code: unknown) => {
  const c = code === undefined || code === null || code === '' ? null : String(code);
  return c === null ? null : { codigo: c, descripcion: table[c] ?? 'DESCONOCIDO' };
};

/**
 * Consulta integrada de validez de comprobantes (API oficial de SUNAT, con las
 * credenciales de API de la empresa que consulta). Sirve para cualquier emisor.
 */
@Injectable()
export class ValidityService {
  constructor(
    private readonly companies: CompaniesService,
    private readonly rest: SunatRestClient,
  ) {}

  async check(company: SunatCompany, q: ValidityDto) {
    const { clientId, clientSecret } = this.companies.clientCredentials(company);
    const [y, m, d] = q.issueDate.split('-');
    const body = {
      numRuc: q.ruc,
      codComp: q.code,
      numeroSerie: q.series,
      numero: String(q.number),
      fechaEmision: `${d}/${m}/${y}`,
      ...(q.total ? { monto: q.total } : {}),
    };
    const res = await this.rest.call({ kind: 'extranet', scope: SCOPES.contribuyentes, clientId, clientSecret }, 'POST', `${API}/${company.ruc}/validarcomprobante`, body);
    if (res.status >= 500) throw new SunatUnavailable(`La consulta de validez de SUNAT respondió HTTP ${res.status}: ${restError(res.json, res.status)}`);
    if (res.status !== 200 || res.json?.success === false) {
      if (res.status === 401 || res.status === 403) throw new SunatFault('0102', `SUNAT rechazó las credenciales de API: ${restError(res.json, res.status)}`);
      throw new BadRequestException(`SUNAT no pudo validar el comprobante: ${restError(res.json, res.status)}`);
    }
    const data = res.json?.data ?? {};
    const observations: string[] = (data.observaciones ?? data.Observaciones ?? []).map((o: unknown) => String(o).replace(/^-\s*/, '').trim());
    return {
      ruc_emisor: q.ruc,
      tipo_documento: q.code,
      serie: q.series,
      numero: q.number,
      fecha_de_emision: q.issueDate,
      estado_comprobante: describe(CP_STATES, data.estadoCp),
      estado_ruc: describe(RUC_STATES, data.estadoRuc),
      condicion_domicilio: describe(DOMICILE, data.condDomiRuc),
      valido: String(data.estadoCp) === '1',
      observaciones: observations,
    };
  }
}
