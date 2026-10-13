import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type SunatCompany, type SunatDocument } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { type Sender, CompaniesService } from './companies.service';
import { DOCUMENT_CODES, DOCUMENT_NAMES } from './core/catalogs';
import { fmt } from './core/decimal';
import { limaNow } from './core/time';
import { type SaleDocumentDto, SaleDocumentSchema } from './dto/document.dto';
import type { DailySummaryDto, DocumentsQueryDto, StatusDto, VoidedDto } from './dto/operations.dto';
import { SunatInputError } from './errors';
import { signXml } from './signing/xml-signer';
import { BillServiceClient, SunatFault, SunatUnavailable } from './transport/bill-service';
import { type Cdr, parseCdrZip } from './transport/cdr';
import { bytes, unzipXml, zipFile } from './transport/zip';
import { buildSaleDocument } from './ubl/compute';
import { saleDocumentXml } from './ubl/invoice-xml';
import type { SaleDocument } from './ubl/model';
import { type SummaryAction, summaryXml, voidedXml } from './ubl/summary-xml';

export type DocumentStatus = 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' | 'ANULADO';

type DocumentWithCompany = SunatDocument & { company: SunatCompany };

/** Comprobante al que apunta una baja o un resumen (se guarda en `input`). */
interface AffectedRef {
  id: string | null;
  type: string;
  series: string;
  number: number;
  action: SummaryAction;
}

const STATUS_TYPES: Record<StatusDto['documento'], string> = { ...DOCUMENT_CODES, resumen_diario: 'RC', comunicacion_baja: 'RA' };

/** Reintentos de un PENDIENTE: a los 2, 5, 15, 30 min… y luego cada 2 h, hasta un día y medio. */
const RETRY_MINUTES = [2, 5, 15, 30, 60, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120];
/** Cuántas veces se le pregunta a SUNAT por un ticket antes de responder PENDIENTE. */
const TICKET_POLLS = 4;
const TICKET_POLL_MS = 1200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function nextCheck(attempts: number): Date | null {
  const minutes = RETRY_MINUTES[attempts];
  return minutes ? new Date(Date.now() + minutes * 60_000) : null;
}

const pascal = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();

/** Nombre de archivo que exige SUNAT: RUC-TIPO-SERIE-NUMERO (o RUC-RC-FECHA-N). */
export function fileName(doc: Pick<SunatDocument, 'type' | 'series' | 'number'>, ruc: string): string {
  return doc.type === 'RC' || doc.type === 'RA' ? `${ruc}-${doc.series}-${doc.number}` : `${ruc}-${doc.type}-${doc.series}-${doc.number}`;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly sunat: BillServiceClient,
  ) {}

  // ---------------------------------------------------------------- emisión

  /** Emite una factura, boleta o nota: la calcula, la firma, la envía y guarda el CDR. */
  async emit(company: SunatCompany, dto: SaleDocumentDto, opts: { hold?: boolean } = {}): Promise<SunatDocument> {
    const sender = this.companies.sender(company);
    const type = DOCUMENT_CODES[dto.documento];
    const issuer = this.companies.issuer(company);
    const now = limaNow();
    const label = `${dto.documento.replace('_', ' de ')} ${dto.serie}`;

    let record: SunatDocument | undefined;
    for (let attempt = 0; attempt < 5 && !record; attempt++) {
      const number = dto.numero ?? (await this.nextNumber(company.id, sender.environment, type, dto.serie));
      const doc = buildSaleDocument(dto, issuer, { number, today: now.date, now: now.time });
      const key = { companyId: company.id, environment: sender.environment, type, series: doc.series, number };
      const existing = await this.prisma.sunatDocument.findUnique({ where: { companyId_environment_type_series_number: key } });
      // Un número rechazado por SUNAT no quedó registrado: se puede volver a usar.
      if (existing && existing.status !== 'RECHAZADO') {
        if (dto.numero === undefined) continue;
        throw new BadRequestException(`ERROR: ${label}-${number} fue emitido anteriormente.`);
      }

      const signed = signXml(saleDocumentXml(doc), sender.certificate);
      const data = {
        issueDate: doc.issueDate,
        status: 'PENDIENTE',
        customerDoc: doc.customer.docNumber,
        customerName: doc.customer.name,
        currency: doc.currency,
        total: fmt(doc.totals.payable),
        hash: signed.hash,
        input: { ...dto, numero: number, fecha_de_emision: doc.issueDate, hora_de_emision: doc.issueTime } as unknown as Prisma.InputJsonValue,
        xml: zipFile(`${fileName({ type, series: doc.series, number }, company.ruc)}.xml`, signed.xml),
        cdr: null,
        sunatCode: null,
        sunatMessage: null,
        observations: Prisma.DbNull,
        ticket: null,
        attempts: 0,
        nextCheckAt: null,
        voidedById: null,
      } satisfies Prisma.SunatDocumentUncheckedUpdateInput;
      try {
        record = existing
          ? await this.prisma.sunatDocument.update({ where: { id: existing.id }, data })
          : await this.prisma.sunatDocument.create({ data: { ...data, ...key, token: randomBytes(18).toString('base64url') } });
      } catch (e) {
        // Otra request tomó ese número a la vez.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          if (dto.numero !== undefined) throw new BadRequestException(`ERROR: ${label}-${number} fue emitido anteriormente.`);
          continue;
        }
        throw e;
      }
    }
    if (!record) throw new BadRequestException(`No se pudo reservar un correlativo para ${label}: inténtalo de nuevo.`);

    // Boletas que el cliente prefiere informar luego, juntas, en un resumen diario.
    if (opts.hold) return record;
    return this.transmit({ ...record, company }, sender);
  }

  /** Siguiente correlativo de una serie (los rechazados no cuentan). */
  private async nextNumber(companyId: string, environment: string, type: string, series: string): Promise<number> {
    const last = await this.prisma.sunatDocument.aggregate({
      where: { companyId, environment, type, series, status: { not: 'RECHAZADO' } },
      _max: { number: true },
    });
    return (last._max.number ?? 0) + 1;
  }

  /** Envía a SUNAT (sendBill) un comprobante guardado y deja registrado el resultado. */
  private async transmit(doc: DocumentWithCompany, sender: Sender): Promise<SunatDocument> {
    const name = fileName(doc, doc.company.ruc);
    try {
      const cdrZip = await this.sunat.sendBill(sender.environment, sender.sol, `${name}.zip`, doc.xml);
      return await this.applyCdr(doc, cdrZip);
    } catch (e) {
      return this.applyFailure(doc, e);
    }
  }

  private async applyCdr(doc: SunatDocument, cdrZip: Buffer): Promise<SunatDocument> {
    let cdr: Cdr;
    try {
      cdr = parseCdrZip(cdrZip);
    } catch (e) {
      return this.applyFailure(doc, new SunatUnavailable('SUNAT devolvió un CDR ilegible', { cause: e }));
    }
    const code = Number(cdr.code);
    // 0 = aceptado; 2000-3999 = rechazado; 4000+ = aceptado con observaciones.
    const status: DocumentStatus = cdr.accepted || code >= 4000 ? 'ACEPTADO' : 'RECHAZADO';
    return this.prisma.sunatDocument.update({
      where: { id: doc.id },
      data: { status, cdr: bytes(cdrZip), sunatCode: cdr.code, sunatMessage: cdr.description, observations: cdr.notes, nextCheckAt: null, attempts: { increment: 1 } },
    });
  }

  /** SUNAT no aceptó el envío: si la falla es suya queda PENDIENTE (se reintenta); si es del comprobante, RECHAZADO. */
  private async applyFailure(doc: SunatDocument, error: unknown): Promise<SunatDocument> {
    if (error instanceof SunatFault && !error.transient) {
      return this.prisma.sunatDocument.update({
        where: { id: doc.id },
        data: { status: 'RECHAZADO', sunatCode: error.code || null, sunatMessage: error.message, nextCheckAt: null, attempts: { increment: 1 } },
      });
    }
    if (!(error instanceof SunatFault) && !(error instanceof SunatUnavailable)) throw error;
    this.logger.warn(`SUNAT no respondió por ${doc.type} ${doc.series}-${doc.number}: ${error.message}`);
    return this.prisma.sunatDocument.update({
      where: { id: doc.id },
      data: {
        status: 'PENDIENTE',
        sunatCode: error instanceof SunatFault ? error.code || null : null,
        sunatMessage: error.message,
        nextCheckAt: nextCheck(doc.attempts),
        attempts: { increment: 1 },
      },
    });
  }

  // ------------------------------------------------------- bajas y resúmenes

  /** Comunicación de baja de facturas y sus notas. Las boletas se anulan por resumen diario. */
  async void(company: SunatCompany, dto: VoidedDto): Promise<SunatDocument> {
    const sender = this.companies.sender(company);
    const targets = dto.documentos_afectados ?? [dto.documento_afectado!];
    const wrong = targets.find((t) => (t.documento === 'factura') !== t.serie.startsWith('F') && (t.documento === 'factura' || t.documento === 'boleta'));
    if (wrong) throw new SunatInputError(`La serie ${wrong.serie} no es de una ${wrong.documento}.`);
    // Las boletas y sus notas no tienen comunicación de baja: se anulan con un resumen diario.
    if (targets.every((t) => t.serie.startsWith('B'))) {
      const documentos_afectados = targets.map((t) => ({ documento: t.documento as 'boleta' | 'nota_credito' | 'nota_debito', serie: t.serie, numero: t.numero, accion: '3' as const }));
      return this.dailySummary(company, { documentos_afectados });
    }
    if (targets.some((t) => t.serie.startsWith('B'))) throw new SunatInputError('Las boletas (serie B) se anulan con un resumen diario: envíalas aparte en POST /sunat/daily-summary.');

    const affected: AffectedRef[] = [];
    const dates = new Set<string>();
    for (const t of targets) {
      const type = DOCUMENT_CODES[t.documento];
      const label = `${pascal(DOCUMENT_NAMES[type].split(' ELECTR')[0])} ${t.serie}-${t.numero}`;
      const found = await this.find(company.id, sender.environment, type, t.serie, t.numero);
      if (found) {
        if (found.status === 'ANULADO') throw new BadRequestException(`${label} ya fue dada de baja.`);
        if (found.status !== 'ACEPTADO') throw new BadRequestException(`${label} está ${found.status}: solo se da de baja un comprobante aceptado por SUNAT.`);
        dates.add(found.issueDate);
      } else if (t.fecha_de_emision) {
        dates.add(t.fecha_de_emision);
      } else {
        throw new BadRequestException(`${label} no se encuentra registrado. Si lo emitiste con otro sistema, indica su fecha_de_emision.`);
      }
      affected.push({ id: found?.id ?? null, type, series: t.serie, number: t.numero, action: '3' });
    }
    if (dates.size > 1) throw new SunatInputError('Una comunicación de baja agrupa comprobantes de una misma fecha de emisión: envía una por cada fecha.');
    const [referenceDate] = [...dates];

    const today = limaNow().date;
    const record = await this.createBatch(company, sender, 'RA', today, referenceDate, { motivo: dto.motivo, afectados: affected }, (id) =>
      voidedXml({
        id,
        referenceDate,
        issueDate: today,
        issuer: { ruc: company.ruc, razonSocial: company.razonSocial },
        lines: affected.map((a) => ({ type: a.type, series: a.series, number: a.number, reason: dto.motivo })),
      }),
    );
    return this.sendBatch({ ...record, company }, sender);
  }

  /** Resumen diario: informa, modifica o anula boletas (y sus notas) ya generadas con la API. */
  async dailySummary(company: SunatCompany, dto: DailySummaryDto): Promise<SunatDocument> {
    const sender = this.companies.sender(company);
    const affected: AffectedRef[] = [];
    const lines: Array<{ action: SummaryAction; document: SaleDocument }> = [];
    const dates = new Set<string>();
    for (const t of dto.documentos_afectados) {
      const type = DOCUMENT_CODES[t.documento];
      const label = `${pascal(DOCUMENT_NAMES[type].split(' ELECTR')[0])} ${t.serie}-${t.numero}`;
      const found = await this.find(company.id, sender.environment, type, t.serie, t.numero);
      if (!found) throw new BadRequestException(`${label} no se encuentra registrado.`);
      if (found.status === 'ANULADO') throw new BadRequestException(`${label} ya fue anulada.`);
      if (found.status === 'RECHAZADO') throw new BadRequestException(`${label} fue rechazado por SUNAT: no existe para SUNAT.`);
      if (t.accion === '3' && found.status !== 'ACEPTADO') throw new BadRequestException(`${label} está ${found.status}: solo se anula un comprobante aceptado por SUNAT.`);
      dates.add(found.issueDate);
      affected.push({ id: found.id, type, series: t.serie, number: t.numero, action: t.accion });
      lines.push({ action: t.accion, document: this.rebuild(found, company) });
    }
    if (dates.size > 1) throw new SunatInputError('Un resumen diario agrupa comprobantes de una misma fecha de emisión: envía uno por cada fecha.');
    const [referenceDate] = [...dates];

    const today = limaNow().date;
    const record = await this.createBatch(company, sender, 'RC', today, referenceDate, { afectados: affected }, (id) =>
      summaryXml({ id, referenceDate, issueDate: today, issuer: { ruc: company.ruc, razonSocial: company.razonSocial }, lines }),
    );
    return this.sendBatch({ ...record, company }, sender);
  }

  /** Vuelve a calcular un comprobante desde el pedido guardado (para el resumen o el PDF). */
  rebuild(doc: SunatDocument, company: SunatCompany): SaleDocument {
    const dto = SaleDocumentSchema.parse(doc.input);
    return buildSaleDocument(dto, this.companies.issuer(company), { number: doc.number, today: doc.issueDate, now: '00:00:00' });
  }

  /** Guarda un resumen (RC) o una baja (RA) con el siguiente correlativo del día. */
  private async createBatch(
    company: SunatCompany,
    sender: Sender,
    type: 'RC' | 'RA',
    today: string,
    referenceDate: string,
    input: Record<string, unknown>,
    build: (id: string) => string,
  ): Promise<SunatDocument> {
    const series = `${type}-${today.replace(/-/g, '')}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await this.prisma.sunatDocument.aggregate({ where: { companyId: company.id, environment: sender.environment, type, series }, _max: { number: true } });
      const number = (last._max.number ?? 0) + 1;
      const signed = signXml(build(`${series}-${number}`), sender.certificate);
      try {
        return await this.prisma.sunatDocument.create({
          data: {
            companyId: company.id,
            environment: sender.environment,
            type,
            series,
            number,
            issueDate: today,
            status: 'PENDIENTE',
            hash: signed.hash,
            token: randomBytes(18).toString('base64url'),
            input: { ...input, fecha_de_referencia: referenceDate } as Prisma.InputJsonValue,
            xml: zipFile(`${company.ruc}-${series}-${number}.xml`, signed.xml),
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
    throw new BadRequestException('No se pudo reservar el correlativo del resumen: inténtalo de nuevo.');
  }

  /** Envía un resumen o una baja (sendSummary) y espera un momento a que SUNAT lo procese. */
  private async sendBatch(doc: DocumentWithCompany, sender: Sender): Promise<SunatDocument> {
    const name = fileName(doc, doc.company.ruc);
    let ticket: string;
    try {
      ticket = await this.sunat.sendSummary(sender.environment, sender.sol, `${name}.zip`, doc.xml);
    } catch (e) {
      return this.applyFailure(doc, e);
    }
    const saved = await this.prisma.sunatDocument.update({ where: { id: doc.id }, data: { ticket, nextCheckAt: nextCheck(0), attempts: { increment: 1 } } });
    return this.checkTicket({ ...saved, company: doc.company }, sender, TICKET_POLLS);
  }

  /** Pregunta a SUNAT por el ticket; al terminar, aplica el resultado a los comprobantes afectados. */
  private async checkTicket(doc: DocumentWithCompany, sender: Sender, polls = 1): Promise<SunatDocument> {
    for (let i = 0; i < polls; i++) {
      if (i > 0) await sleep(TICKET_POLL_MS);
      let status;
      try {
        status = await this.sunat.getStatus(sender.environment, sender.sol, doc.ticket!);
      } catch (e) {
        if (e instanceof SunatFault && !e.transient) return this.finishBatch(doc, 'RECHAZADO', { code: e.code, message: e.message });
        if (e instanceof SunatFault || e instanceof SunatUnavailable) break;
        throw e;
      }
      if (status.statusCode === '98') continue; // en proceso
      if (!status.content) return this.finishBatch(doc, 'RECHAZADO', { code: status.statusCode, message: 'SUNAT no devolvió la constancia del envío.' });
      let cdr: Cdr;
      try {
        cdr = parseCdrZip(status.content);
      } catch {
        // En un error, `content` puede traer solo el mensaje.
        return this.finishBatch(doc, 'RECHAZADO', { code: status.statusCode, message: status.content.toString('utf8').slice(0, 300) });
      }
      const accepted = cdr.accepted || Number(cdr.code) >= 4000;
      return this.finishBatch(doc, accepted ? 'ACEPTADO' : 'RECHAZADO', { code: cdr.code, message: cdr.description, notes: cdr.notes, cdr: status.content });
    }
    return this.prisma.sunatDocument.update({ where: { id: doc.id }, data: { nextCheckAt: nextCheck(doc.attempts), attempts: { increment: 1 } } });
  }

  private async finishBatch(doc: SunatDocument, status: DocumentStatus, result: { code: string; message: string; notes?: string[]; cdr?: Buffer }): Promise<SunatDocument> {
    const affected = ((doc.input as { afectados?: AffectedRef[] }).afectados ?? []).filter((a) => a.id);
    const updates: Prisma.PrismaPromise<unknown>[] = [];
    if (status === 'ACEPTADO') {
      const voided = affected.filter((a) => a.action === '3').map((a) => a.id!);
      const informed = affected.filter((a) => a.action !== '3').map((a) => a.id!);
      if (voided.length) updates.push(this.prisma.sunatDocument.updateMany({ where: { id: { in: voided } }, data: { status: 'ANULADO', voidedById: doc.id } }));
      // Boletas que esperaban su resumen: ya están informadas.
      if (informed.length) {
        updates.push(
          this.prisma.sunatDocument.updateMany({
            where: { id: { in: informed }, status: 'PENDIENTE' },
            data: { status: 'ACEPTADO', sunatCode: '0', sunatMessage: `Informado en el resumen diario ${doc.series}-${doc.number}`, nextCheckAt: null },
          }),
        );
      }
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.sunatDocument.update({
        where: { id: doc.id },
        data: { status, sunatCode: result.code || null, sunatMessage: result.message, observations: result.notes ?? [], cdr: result.cdr ? bytes(result.cdr) : null, nextCheckAt: null },
      }),
      ...updates,
    ]);
    return updated as SunatDocument;
  }

  // ------------------------------------------------------- estado y archivos

  private find(companyId: string, environment: string, type: string, series: string, number: number): Promise<SunatDocument | null> {
    return this.prisma.sunatDocument.findUnique({ where: { companyId_environment_type_series_number: { companyId, environment, type, series, number } } });
  }

  /** Estado actual de un comprobante; si quedó PENDIENTE, vuelve a consultarle a SUNAT. */
  async status(company: SunatCompany, dto: StatusDto): Promise<SunatDocument> {
    const type = STATUS_TYPES[dto.documento];
    const doc = await this.find(company.id, company.environment, type, dto.serie, dto.numero);
    if (!doc) throw new BadRequestException(`${pascal(dto.documento.replace(/_/g, ' '))} ${dto.serie}-${dto.numero} no se encuentra registrado.`);
    return doc.status === 'PENDIENTE' ? this.refresh({ ...doc, company }) : doc;
  }

  /** Vuelve a intentar un PENDIENTE: consulta el ticket, recupera el CDR o reenvía el comprobante. */
  async refresh(doc: DocumentWithCompany): Promise<SunatDocument> {
    // Boleta guardada para un resumen diario: no hay nada que consultar todavía.
    if (doc.status !== 'PENDIENTE' || (doc.attempts === 0 && !doc.ticket)) return doc;
    let sender: Sender;
    try {
      sender = this.companies.sender({ ...doc.company, environment: doc.environment });
    } catch (e) {
      this.logger.warn(`No se puede reintentar ${doc.type} ${doc.series}-${doc.number}: ${(e as Error).message}`);
      return doc;
    }
    if (doc.ticket && (doc.type === 'RC' || doc.type === 'RA')) return this.checkTicket(doc, sender);
    if (doc.type === 'RC' || doc.type === 'RA') return this.sendBatch(doc, sender);

    // En producción SUNAT puede tener ya el comprobante (se cortó la respuesta): se pide su CDR.
    if (sender.environment === 'produccion') {
      try {
        const found = await this.sunat.getStatusCdr(sender.sol, { ruc: doc.company.ruc, type: doc.type, series: doc.series, number: doc.number });
        if (found.content) return await this.applyCdr(doc, found.content);
      } catch (e) {
        if (!(e instanceof SunatFault) && !(e instanceof SunatUnavailable)) throw e;
      }
    }
    return this.transmit(doc, sender);
  }

  /** Worker: reintenta los PENDIENTE a los que les toca. */
  async pollDue(limit = 15): Promise<{ checked: number; resolved: number }> {
    if (!this.prisma.enabled) return { checked: 0, resolved: 0 };
    const due = await this.prisma.sunatDocument.findMany({
      where: { status: 'PENDIENTE', nextCheckAt: { lte: new Date() } },
      orderBy: { nextCheckAt: 'asc' },
      take: limit,
      include: { company: true },
    });
    let resolved = 0;
    for (const doc of due) {
      try {
        const after = await this.refresh(doc);
        if (after.status !== 'PENDIENTE') resolved++;
      } catch (e) {
        this.logger.error(`Falló el reintento de ${doc.type} ${doc.series}-${doc.number}: ${String(e)}`);
        await this.prisma.sunatDocument.update({ where: { id: doc.id }, data: { nextCheckAt: nextCheck(doc.attempts), attempts: { increment: 1 } } }).catch(() => undefined);
      }
    }
    return { checked: due.length, resolved };
  }

  async list(company: SunatCompany, q: DocumentsQueryDto) {
    const where: Prisma.SunatDocumentWhereInput = {
      companyId: company.id,
      environment: company.environment,
      ...(q.documento ? { type: STATUS_TYPES[q.documento] } : {}),
      ...(q.serie ? { series: q.serie } : {}),
      ...(q.estado ? { status: q.estado } : {}),
      ...(q.cliente ? { customerDoc: q.cliente } : {}),
      ...(q.desde || q.hasta ? { issueDate: { ...(q.desde ? { gte: q.desde } : {}), ...(q.hasta ? { lte: q.hasta } : {}) } } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.sunatDocument.count({ where }),
      this.prisma.sunatDocument.findMany({ where, orderBy: [{ createdAt: 'desc' }, { number: 'desc' }], skip: (q.page - 1) * q.per_page, take: q.per_page }),
    ]);
    return { paginate: { page: q.page, per_page: q.per_page, total_pages: Math.ceil(total / q.per_page), items: items.length, total_items: total }, items };
  }

  /** Datos de cabecera de un comprobante, para listados. */
  summary(doc: SunatDocument) {
    const names = Object.entries(STATUS_TYPES) as Array<[string, string]>;
    return {
      documento: names.find(([, code]) => code === doc.type)?.[0] ?? doc.type,
      fecha_de_emision: doc.issueDate,
      cliente_numero_de_documento: doc.customerDoc,
      cliente_denominacion: doc.customerName,
      moneda: doc.currency,
      total: doc.total?.toFixed(2) ?? null,
      creado: doc.createdAt,
    };
  }

  /** Comprobante por el token de sus URL públicas. */
  async byToken(token: string): Promise<DocumentWithCompany> {
    if (!this.prisma.enabled) throw new NotFoundException();
    const doc = await this.prisma.sunatDocument.findUnique({ where: { token }, include: { company: true } });
    if (!doc) throw new NotFoundException('El archivo no existe.');
    return doc;
  }

  signedXml(doc: SunatDocument): string {
    return unzipXml(doc.xml)!.xml;
  }

  cdrXml(doc: SunatDocument): string | null {
    return doc.cdr ? (unzipXml(doc.cdr)?.xml ?? null) : null;
  }

  // ------------------------------------------------------------- respuesta

  /** Respuesta de la API para un comprobante (el formato de apisunat.pe, con algunos datos más). */
  view(doc: SunatDocument, ruc: string, baseUrl: string) {
    const name = fileName(doc, ruc);
    const files = `${baseUrl}/v1/sunat/files/${doc.token}`;
    const printable = doc.type !== 'RC' && doc.type !== 'RA';
    const observations = (doc.observations as string[] | null) ?? [];
    return {
      success: true,
      message: message(doc, observations),
      payload: {
        estado: doc.status as DocumentStatus,
        hash: doc.hash,
        xml: `${files}/${name}.xml`,
        cdr: doc.cdr ? `${files}/R-${name}.xml` : null,
        ...(printable ? { pdf: { ticket: `${files}/${name}-ticket.pdf`, a4: `${files}/${name}.pdf` } } : {}),
        serie: doc.series,
        numero: doc.number,
        ambiente: doc.environment,
        ...(doc.ticket ? { ticket: doc.ticket } : {}),
        sunat: { codigo: doc.sunatCode, descripcion: doc.sunatMessage, observaciones: observations },
      },
    };
  }
}

function message(doc: SunatDocument, observations: string[]): string {
  const batch = doc.type === 'RC' ? 'El resumen diario' : doc.type === 'RA' ? 'La comunicación de baja' : null;
  switch (doc.status as DocumentStatus) {
    case 'ACEPTADO':
      if (batch) return `${batch} fue ${doc.type === 'RC' ? 'aceptado' : 'aceptada'} por SUNAT.`;
      return observations.length ? 'El comprobante fue aceptado por SUNAT con observaciones.' : 'El comprobante fue enviado y aceptado por SUNAT.';
    case 'RECHAZADO':
      return `${batch ?? 'El comprobante'} presenta errores o datos incorrectos${doc.sunatMessage ? `: ${doc.sunatMessage}` : ''}`;
    case 'ANULADO':
      return 'El comprobante fue dado de baja.';
    default:
      if (batch) return `${batch} fue ${doc.type === 'RC' ? 'recepcionado' : 'recepcionada'} por SUNAT y está en proceso, consulte su estado en unos minutos.`;
      if (doc.attempts === 0) return 'El comprobante está firmado y guardado: se informa a SUNAT con un resumen diario (POST /sunat/daily-summary).';
      return 'El comprobante aún está siendo procesado por SUNAT, consulte su estado en unos minutos.';
  }
}
