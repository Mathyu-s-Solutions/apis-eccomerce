import { Injectable } from '@nestjs/common';
import type { SunatCompany } from '../../../../generated/prisma';
import { CompaniesService } from '../companies.service';
import type { SireQueryDto } from '../dto/consultas.dto';
import { SunatFault, SunatUnavailable } from '../transport/bill-service';
import { SCOPES, SunatRestClient, restError } from '../transport/sunat-rest';

const BASE = 'https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros';
/** SUNAT responde 422 con más de 100 por página. */
const PER_PAGE = 100;
const MAX_PAGES = 50;
const CACHE_MS = 10 * 60_000;

export type SireBook = 'rce' | 'rvie';

/** Catálogo 10 (tipos de comprobante en los registros), los de uso común. */
const CP_NAMES: Record<string, string> = {
  '00': 'Otros',
  '01': 'Factura',
  '02': 'Recibo por Honorarios',
  '03': 'Boleta de Venta',
  '04': 'Liquidación de compra',
  '05': 'Boleto de compañía de aviación',
  '07': 'Nota de crédito',
  '08': 'Nota de débito',
  '12': 'Ticket o cinta emitido por máquina registradora',
  '14': 'Recibo por servicios públicos',
  '46': 'Formulario de declaración - pago o boleta de pago de tributos internos',
  '50': 'Declaración Única de Aduanas - Importación definitiva',
  '91': 'Comprobante de No Domiciliado',
};

type Row = Record<string, unknown>;

/** El SIRE a veces manda los montos y el tipo de cambio anidados: se aplanan. */
function flat(row: Row): Row {
  const out: Row = { ...row };
  for (const nested of ['montos', 'tipoCambio']) {
    const value = row[nested];
    if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(out, value);
  }
  return out;
}

function pick(row: Row, names: string[]): string | null {
  for (const name of names) {
    const v = row[name];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

const num = (row: Row, names: string[]) => {
  const v = Number(pick(row, names) ?? 0);
  return Number.isFinite(v) ? v : 0;
};
const sum = (row: Row, names: string[]) => names.reduce((s, n) => s + num(row, [n]), 0);
const money = (v: number) => v.toFixed(2);

/** dd/mm/aaaa → aaaa-mm-dd (deja igual lo que ya viene en ISO). */
function isoDate(value: string | null): string | null {
  if (!value) return null;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : value.slice(0, 10);
}

export interface SireItem {
  emisor: { ruc: string | null; razon_social: string | null };
  cliente: { tipo_documento: string | null; numero_documento: string | null; nombre_cliente: string | null };
  detalle: Record<string, unknown>;
  totales: Record<string, string>;
  /** El registro tal como lo devolvió SUNAT. */
  sunat: Row;
}

/** Normaliza un comprobante de la propuesta (compras o ventas) al formato de la API. */
export function sireItem(book: SireBook, raw: Row, company: { ruc: string; razonSocial: string }): SireItem {
  const r = flat(raw);
  const type = pick(r, ['codTipoCDP', 'codTipoComprobante', 'codTipoDocumento']);
  const detalle = {
    periodo: pick(r, ['perTributario', 'perPeriodoTributario']),
    car_sunat: pick(r, ['codCar']),
    tipo_comprobante: type,
    nombre_comprobante: (type && CP_NAMES[type]) ?? null,
    serie: pick(r, ['numSerieCDP', 'numSerie', 'desSerieCDP']),
    numero: pick(r, ['numCDP', 'numComprobante', 'numCorrelativo']),
    numero_final: pick(r, ['numCDPRangoFinal', 'numCdpFinal']),
    fecha_emision: isoDate(pick(r, ['fecEmision', 'fecEmisionCDP'])),
    fecha_vencimiento: isoDate(pick(r, ['fecVencPag', 'fecVencimiento', 'fecVcto'])),
    codigo_moneda: pick(r, ['codMoneda']) ?? 'PEN',
    tipo_cambio: pick(r, ['mtoTipoCambio', 'valTipoCambio']),
    estado_comprobante: pick(r, ['codEstadoComprobante', 'desEstadoComprobante']),
    documentos_modificados: Array.isArray(r.documentoMod) ? r.documentoMod : [],
  };

  if (book === 'rce') {
    return {
      emisor: { ruc: pick(r, ['numDocIdentidadProveedor', 'numRucProveedor', 'numRuc']), razon_social: pick(r, ['desRazonSocialProveedor', 'nomRazonSocialProveedor', 'desProveedor', 'nomRazonSocialEmisor']) },
      cliente: { tipo_documento: '6', numero_documento: company.ruc, nombre_cliente: company.razonSocial },
      detalle,
      totales: {
        base_imponible: money(sum(r, ['mtoBIGravadaDG', 'mtoBIGravadaDGNG', 'mtoBIGravadaDNG'])),
        igv: money(sum(r, ['mtoIgvIpmDG', 'mtoIgvIpmDGNG', 'mtoIgvIpmDNG'])),
        base_imponible_dg: money(num(r, ['mtoBIGravadaDG'])),
        igv_dg: money(num(r, ['mtoIgvIpmDG'])),
        base_imponible_dgng: money(num(r, ['mtoBIGravadaDGNG'])),
        igv_dgng: money(num(r, ['mtoIgvIpmDGNG'])),
        base_imponible_dng: money(num(r, ['mtoBIGravadaDNG'])),
        igv_dng: money(num(r, ['mtoIgvIpmDNG'])),
        no_gravado: money(num(r, ['mtoValorAdqNG'])),
        isc: money(num(r, ['mtoISC', 'mtoIsc'])),
        icbper: money(num(r, ['mtoIcbp', 'mtoICBPER'])),
        otros_tributos: money(num(r, ['mtoOtrosTrib', 'mtoOtrosTributos', 'mtoOtrosCargos'])),
        total: money(num(r, ['mtoTotalCp', 'mtoTotalCP', 'mtoImporteTotal'])),
      },
      sunat: raw,
    };
  }
  return {
    emisor: { ruc: company.ruc, razon_social: company.razonSocial },
    cliente: {
      tipo_documento: pick(r, ['codTipoDocIdentidad', 'codTipoDocIdentidadCliente']),
      numero_documento: pick(r, ['numDocIdentidad', 'numDocIdentidadCliente']),
      nombre_cliente: pick(r, ['nomRazonSocialCliente', 'desRazonSocialCliente', 'desCliente']),
    },
    detalle,
    totales: {
      valor_exportacion: money(num(r, ['mtoValFactExpo'])),
      // El RVIE manda los descuentos aparte y en positivo.
      base_imponible: money(num(r, ['mtoBIGravada']) - num(r, ['mtoDsctoBI'])),
      igv: money(num(r, ['mtoIGV', 'mtoIgvIpm']) - num(r, ['mtoDsctoIGV', 'mtoDsctoIgvIpm'])),
      exonerado: money(num(r, ['mtoExonerado'])),
      inafecto: money(num(r, ['mtoInafecto'])),
      isc: money(num(r, ['mtoISC', 'mtoIsc'])),
      base_imponible_ivap: money(num(r, ['mtoBIIvap'])),
      ivap: money(num(r, ['mtoIvap'])),
      icbper: money(num(r, ['mtoIcbp', 'mtoIcbper'])),
      otros_tributos: money(num(r, ['mtoOtrosTrib', 'mtoOtrosTributos'])),
      valor_operaciones_gratuitas: money(num(r, ['mtoValorOpGratuitas'])),
      total: money(num(r, ['mtoTotalCP', 'mtoTotalCp'])),
    },
    sunat: raw,
  };
}

/**
 * Registros de compras (RCE) y de ventas (RVIE) del SIRE: la propuesta que arma
 * SUNAT con los comprobantes electrónicos del periodo. Usa las credenciales de
 * API y el usuario SOL de la empresa.
 */
@Injectable()
export class SireService {
  private readonly cache = new Map<string, { rows: Row[]; at: number }>();

  constructor(
    private readonly companies: CompaniesService,
    private readonly rest: SunatRestClient,
  ) {}

  private url(book: SireBook, period: string): string {
    return book === 'rce' ? `${BASE}/rce/propuesta/web/propuesta/${period}/busqueda` : `${BASE}/rvie/propuesta/web/propuesta/${period}/comprobantes`;
  }

  /** Todos los comprobantes de la propuesta del periodo (una página de SUNAT a la vez). */
  private async fetchAll(company: SunatCompany, book: SireBook, period: string): Promise<Row[]> {
    const cred = this.companies.apiCredentials(company);
    const grant = { kind: 'sol' as const, scope: SCOPES.sire, clientId: cred.clientId, clientSecret: cred.clientSecret, sol: cred.sol };
    const rows: Row[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      // codTipoOpe=1: adquisiciones (el RVIE no lo acepta).
      const query = new URLSearchParams({ ...(book === 'rce' ? { codTipoOpe: '1' } : {}), page: String(page), perPage: String(PER_PAGE) });
      const res = await this.rest.call(grant, 'GET', `${this.url(book, period)}?${query}`);
      // 422: no hay propuesta para el periodo (o ya no hay más páginas).
      if (res.status === 422) return rows;
      if (res.status === 401 || res.status === 403) throw new SunatFault('0102', `SUNAT rechazó el acceso al SIRE: ${restError(res.json, res.status)}`);
      if (res.status !== 200) throw new SunatUnavailable(`El SIRE respondió HTTP ${res.status}: ${restError(res.json, res.status)}`);
      const batch: Row[] = Array.isArray(res.json) ? res.json : (res.json?.registros ?? []);
      const total = Number(res.json?.paginacion?.totalRegistros);
      rows.push(...batch);
      if (batch.length < PER_PAGE || (Number.isFinite(total) && rows.length >= total)) return rows;
    }
    return rows;
  }

  async report(company: SunatCompany, book: SireBook, q: SireQueryDto) {
    const key = `${company.id}|${book}|${q.period}`;
    let cached = this.cache.get(key);
    if (!cached || q.refresh || Date.now() - cached.at > CACHE_MS) {
      cached = { rows: await this.fetchAll(company, book, q.period), at: Date.now() };
      this.cache.set(key, cached);
      if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value as string);
    }

    let items = cached.rows.map((r) => sireItem(book, r, company));
    if (q.document_type) items = items.filter((i) => i.detalle.tipo_comprobante === q.document_type);
    if (q.document_ruc) items = items.filter((i) => (book === 'rce' ? i.emisor.ruc : i.cliente.numero_documento) === q.document_ruc);
    if (q.start_date) items = items.filter((i) => String(i.detalle.fecha_emision ?? '') >= q.start_date!);
    if (q.end_date) items = items.filter((i) => String(i.detalle.fecha_emision ?? '') <= q.end_date!);

    const totalItems = items.length;
    const pageItems = items.slice((q.page - 1) * q.per_page, q.page * q.per_page);
    return {
      paginate: { page: q.page, total_pages: Math.ceil(totalItems / q.per_page), per_page: q.per_page, items: pageItems.length, total_items: totalItems },
      consultado: new Date(cached.at).toISOString(),
      items: pageItems,
    };
  }
}
