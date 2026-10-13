import { TAX_SCHEMES } from '../core/catalogs';
import { type Dec, fmt, isZero } from '../core/decimal';
import { el, group } from '../core/xml';
import { EXTENSIONS, signatureRef } from './invoice-xml';
import type { Issuer, SaleDocument } from './model';

const NS =
  ' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"' +
  ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"' +
  ' xmlns:ds="http://www.w3.org/2000/09/xmldsig#"' +
  ' xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"' +
  ' xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1"';

function header(id: string, referenceDate: string, issueDate: string, issuer: Pick<Issuer, 'ruc' | 'razonSocial'>, version: string): string {
  return [
    EXTENSIONS,
    el('cbc:UBLVersionID', '2.0'),
    el('cbc:CustomizationID', version),
    el('cbc:ID', id),
    // ReferenceDate: fecha de emisión de los comprobantes. IssueDate: fecha en que se genera el resumen.
    el('cbc:ReferenceDate', referenceDate),
    el('cbc:IssueDate', issueDate),
    signatureRef(issuer),
    group('cac:AccountingSupplierParty', [
      el('cbc:CustomerAssignedAccountID', issuer.ruc),
      el('cbc:AdditionalAccountID', '6'),
      group('cac:Party', [group('cac:PartyLegalEntity', [el('cbc:RegistrationName', issuer.razonSocial)])]),
    ]),
  ].join('');
}

/** Qué se informa de cada comprobante en el resumen: 1 alta, 2 modificación, 3 anulación. */
export type SummaryAction = '1' | '2' | '3';

export interface SummaryLine {
  action: SummaryAction;
  /** El comprobante ya calculado (boleta, o nota de una boleta). */
  document: SaleDocument;
}

export interface SummaryDocument {
  /** RC-AAAAMMDD-N */
  id: string;
  /** Fecha de emisión de los comprobantes del resumen (todos del mismo día). */
  referenceDate: string;
  issueDate: string;
  issuer: Pick<Issuer, 'ruc' | 'razonSocial'>;
  lines: SummaryLine[];
}

function billing(amount: Dec, instruction: string, currency: string): string {
  if (isZero(amount)) return '';
  return group('sac:BillingPayment', [el('cbc:PaidAmount', fmt(amount), { currencyID: currency }), el('cbc:InstructionID', instruction)]);
}

function summaryLine(line: SummaryLine, index: number): string {
  const d = line.document;
  const t = d.totals;
  const cur = { currencyID: d.currency };
  return group('sac:SummaryDocumentsLine', [
    el('cbc:LineID', index),
    el('cbc:DocumentTypeCode', d.type),
    el('cbc:ID', `${d.series}-${d.number}`),
    group('cac:AccountingCustomerParty', [el('cbc:CustomerAssignedAccountID', d.customer.docNumber), el('cbc:AdditionalAccountID', d.customer.docType)]),
    d.note
      ? group('cac:BillingReference', [group('cac:InvoiceDocumentReference', [el('cbc:ID', d.note.affectedId), el('cbc:DocumentTypeCode', d.note.affectedType)])])
      : '',
    group('cac:Status', [el('cbc:ConditionCode', line.action)]),
    el('sac:TotalAmount', fmt(t.payable), cur),
    billing(t.gravadas, '01', d.currency),
    billing(t.exoneradas, '02', d.currency),
    billing(t.inafectas, '03', d.currency),
    billing(t.exportacion, '04', d.currency),
    billing(t.gratuitas, '05', d.currency),
    group('cac:TaxTotal', [
      el('cbc:TaxAmount', fmt(t.igv), cur),
      group('cac:TaxSubtotal', [
        el('cbc:TaxAmount', fmt(t.igv), cur),
        group('cac:TaxCategory', [group('cac:TaxScheme', [el('cbc:ID', TAX_SCHEMES.IGV.id), el('cbc:Name', TAX_SCHEMES.IGV.name), el('cbc:TaxTypeCode', TAX_SCHEMES.IGV.code)])]),
      ]),
    ]),
  ]);
}

/** Resumen diario de boletas (y sus notas): altas, modificaciones y anulaciones. */
export function summaryXml(doc: SummaryDocument): string {
  const body = header(doc.id, doc.referenceDate, doc.issueDate, doc.issuer, '1.1') + doc.lines.map((l, i) => summaryLine(l, i + 1)).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<SummaryDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1"${NS}>${body}</SummaryDocuments>`;
}

export interface VoidedDocument {
  /** RA-AAAAMMDD-N */
  id: string;
  /** Fecha de emisión de los comprobantes que se dan de baja (todos del mismo día). */
  referenceDate: string;
  issueDate: string;
  issuer: Pick<Issuer, 'ruc' | 'razonSocial'>;
  lines: Array<{ type: string; series: string; number: number; reason: string }>;
}

/** Comunicación de baja de facturas y de sus notas. */
export function voidedXml(doc: VoidedDocument): string {
  const lines = doc.lines
    .map((l, i) =>
      group('sac:VoidedDocumentsLine', [
        el('cbc:LineID', i + 1),
        el('cbc:DocumentTypeCode', l.type),
        el('sac:DocumentSerialID', l.series),
        el('sac:DocumentNumberID', l.number),
        el('sac:VoidReasonDescription', l.reason),
      ]),
    )
    .join('');
  const body = header(doc.id, doc.referenceDate, doc.issueDate, doc.issuer, '1.0') + lines;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<VoidedDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1"${NS}>${body}</VoidedDocuments>`;
}
