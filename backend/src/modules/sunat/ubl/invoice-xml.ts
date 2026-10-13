import { TAX_SCHEMES, type TaxScheme } from '../core/catalogs';
import { type Dec, ZERO, fmt, fmtTrim, isZero } from '../core/decimal';
import { el, esc, group } from '../core/xml';
import type { Allowance, Issuer, Line, SaleDocument } from './model';

/** Id del nodo ds:Signature al que apunta cac:Signature. */
export const SIGNATURE_ID = 'SignatureMT';

const ROOTS = {
  '01': { tag: 'Invoice', ns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2', line: 'InvoiceLine', quantity: 'InvoicedQuantity', totals: 'LegalMonetaryTotal' },
  '03': { tag: 'Invoice', ns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2', line: 'InvoiceLine', quantity: 'InvoicedQuantity', totals: 'LegalMonetaryTotal' },
  '07': { tag: 'CreditNote', ns: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2', line: 'CreditNoteLine', quantity: 'CreditedQuantity', totals: 'LegalMonetaryTotal' },
  '08': { tag: 'DebitNote', ns: 'urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2', line: 'DebitNoteLine', quantity: 'DebitedQuantity', totals: 'RequestedMonetaryTotal' },
} as const;

export const UBL_NAMESPACES =
  ' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"' +
  ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"' +
  ' xmlns:ds="http://www.w3.org/2000/09/xmldsig#"' +
  ' xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"';

/** Donde el firmador mete el ds:Signature. */
export const EXTENSIONS = '<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>';

/** cac:Signature: quién firma y dónde está la firma. */
export function signatureRef(issuer: Pick<Issuer, 'ruc' | 'razonSocial'>): string {
  return group('cac:Signature', [
    el('cbc:ID', `SIGN${issuer.ruc}`),
    group('cac:SignatoryParty', [
      group('cac:PartyIdentification', [el('cbc:ID', issuer.ruc)]),
      group('cac:PartyName', [el('cbc:Name', issuer.razonSocial)]),
    ]),
    group('cac:DigitalSignatureAttachment', [group('cac:ExternalReference', [el('cbc:URI', `#${SIGNATURE_ID}`)])]),
  ]);
}

function supplier(issuer: Issuer): string {
  return group('cac:AccountingSupplierParty', [
    group('cac:Party', [
      group('cac:PartyIdentification', [el('cbc:ID', issuer.ruc, { schemeID: '6' })]),
      issuer.nombreComercial ? group('cac:PartyName', [el('cbc:Name', issuer.nombreComercial)]) : '',
      group('cac:PartyLegalEntity', [
        el('cbc:RegistrationName', issuer.razonSocial),
        group('cac:RegistrationAddress', [
          el('cbc:ID', issuer.ubigeo),
          el('cbc:AddressTypeCode', issuer.codigoAnexo),
          el('cbc:CitySubdivisionName', issuer.urbanizacion),
          el('cbc:CityName', issuer.provincia),
          el('cbc:CountrySubentity', issuer.departamento),
          el('cbc:District', issuer.distrito),
          group('cac:AddressLine', [el('cbc:Line', issuer.direccion)]),
          group('cac:Country', [el('cbc:IdentificationCode', 'PE')]),
        ]),
      ]),
    ]),
  ]);
}

function customer(doc: SaleDocument): string {
  const c = doc.customer;
  return group('cac:AccountingCustomerParty', [
    group('cac:Party', [
      group('cac:PartyIdentification', [el('cbc:ID', c.docNumber, { schemeID: c.docType })]),
      group('cac:PartyLegalEntity', [
        el('cbc:RegistrationName', c.name),
        c.address ? group('cac:RegistrationAddress', [group('cac:AddressLine', [el('cbc:Line', c.address)])]) : '',
      ]),
    ]),
  ]);
}

function allowance(a: Allowance, currency: string): string {
  return group('cac:AllowanceCharge', [
    el('cbc:ChargeIndicator', 'false'),
    el('cbc:AllowanceChargeReasonCode', a.code),
    el('cbc:MultiplierFactorNumeric', fmt(a.factor, 5)),
    el('cbc:Amount', fmt(a.amount), { currencyID: currency }),
    el('cbc:BaseAmount', fmt(a.base), { currencyID: currency }),
  ]);
}

function taxScheme(s: TaxScheme): string {
  return group('cac:TaxScheme', [el('cbc:ID', s.id), el('cbc:Name', s.name), el('cbc:TaxTypeCode', s.code)]);
}

function taxSubtotal(taxable: Dec, tax: Dec, scheme: TaxScheme, currency: string): string {
  return group('cac:TaxSubtotal', [
    el('cbc:TaxableAmount', fmt(taxable), { currencyID: currency }),
    el('cbc:TaxAmount', fmt(tax), { currencyID: currency }),
    group('cac:TaxCategory', [taxScheme(scheme)]),
  ]);
}

function taxTotal(doc: SaleDocument): string {
  const t = doc.totals;
  const cur = doc.currency;
  const hasLine = (kind: string, free: boolean) => doc.lines.some((l) => l.affectation.kind === kind && l.affectation.free === free);
  return group('cac:TaxTotal', [
    el('cbc:TaxAmount', fmt(t.taxes), { currencyID: cur }),
    hasLine('gravado', false) ? taxSubtotal(t.gravadas, t.igv, TAX_SCHEMES.IGV, cur) : '',
    hasLine('ivap', false) ? taxSubtotal(t.ivap, t.igvIvap, TAX_SCHEMES.IVAP, cur) : '',
    hasLine('inafecto', false) ? taxSubtotal(t.inafectas, ZERO, TAX_SCHEMES.INA, cur) : '',
    hasLine('exonerado', false) ? taxSubtotal(t.exoneradas, ZERO, TAX_SCHEMES.EXO, cur) : '',
    doc.lines.some((l) => l.affectation.free) ? taxSubtotal(t.gratuitas, t.igvGratuitas, TAX_SCHEMES.GRA, cur) : '',
    hasLine('exportacion', false) ? taxSubtotal(t.exportacion, ZERO, TAX_SCHEMES.EXP, cur) : '',
  ]);
}

function monetaryTotal(doc: SaleDocument, tag: string): string {
  const t = doc.totals;
  const cur = { currencyID: doc.currency };
  return group(`cac:${tag}`, [
    el('cbc:LineExtensionAmount', fmt(t.value), cur),
    el('cbc:TaxInclusiveAmount', fmt(t.priceWithTaxes), cur),
    isZero(t.discounts) ? '' : el('cbc:AllowanceTotalAmount', fmt(t.discounts), cur),
    isZero(t.prepaid) ? '' : el('cbc:PrepaidAmount', fmt(t.prepaid), cur),
    el('cbc:PayableAmount', fmt(t.payable), cur),
  ]);
}

function paymentTerms(doc: SaleDocument): string {
  const cur = { currencyID: doc.currency };
  const out: string[] = [];
  if (doc.detraction) {
    const d = doc.detraction;
    out.push(
      group('cac:PaymentMeans', [
        el('cbc:ID', 'Detraccion'),
        el('cbc:PaymentMeansCode', d.paymentMeans),
        group('cac:PayeeFinancialAccount', [el('cbc:ID', d.account)]),
      ]),
      group('cac:PaymentTerms', [
        el('cbc:ID', 'Detraccion'),
        el('cbc:PaymentMeansID', d.code),
        el('cbc:PaymentPercent', fmtTrim(d.percent, 3, 2)),
        // La detracción siempre se expresa en soles.
        el('cbc:Amount', fmt(d.amount), { currencyID: 'PEN' }),
      ]),
    );
  }
  if (doc.payment) {
    const p = doc.payment;
    out.push(
      group('cac:PaymentTerms', [
        el('cbc:ID', 'FormaPago'),
        el('cbc:PaymentMeansID', p.type),
        p.pending !== undefined ? el('cbc:Amount', fmt(p.pending), cur) : '',
      ]),
      ...p.installments.map((c, i) =>
        group('cac:PaymentTerms', [
          el('cbc:ID', 'FormaPago'),
          el('cbc:PaymentMeansID', `Cuota${String(i + 1).padStart(3, '0')}`),
          el('cbc:Amount', fmt(c.amount), cur),
          el('cbc:PaymentDueDate', c.dueDate),
        ]),
      ),
    );
  }
  return out.join('');
}

function line(l: Line, doc: SaleDocument, root: (typeof ROOTS)[keyof typeof ROOTS]): string {
  const cur = { currencyID: doc.currency };
  const free = l.affectation.free;
  return group(`cac:${root.line}`, [
    el('cbc:ID', l.index),
    el(`cbc:${root.quantity}`, fmtTrim(l.quantity, 10), { unitCode: l.unit }),
    el('cbc:LineExtensionAmount', fmt(l.value), cur),
    group('cac:PricingReference', [
      group('cac:AlternativeConditionPrice', [
        el('cbc:PriceAmount', fmtTrim(l.unitPrice, 10, 2), cur),
        // 01 = precio unitario con impuestos; 02 = valor referencial de una operación gratuita.
        el('cbc:PriceTypeCode', free ? '02' : '01'),
      ]),
    ]),
    ...l.discounts.map((d) => allowance(d, doc.currency)),
    group('cac:TaxTotal', [
      el('cbc:TaxAmount', fmt(l.igv), cur),
      group('cac:TaxSubtotal', [
        el('cbc:TaxableAmount', fmt(l.value), cur),
        el('cbc:TaxAmount', fmt(l.igv), cur),
        group('cac:TaxCategory', [
          el('cbc:Percent', fmtTrim(l.igvPercent, 2, 2)),
          el('cbc:TaxExemptionReasonCode', l.affectationCode),
          taxScheme(l.affectation.scheme),
        ]),
      ]),
    ]),
    group('cac:Item', [
      el('cbc:Description', l.description),
      l.code ? group('cac:SellersItemIdentification', [el('cbc:ID', l.code)]) : '',
      l.sunatCode ? group('cac:CommodityClassification', [el('cbc:ItemClassificationCode', l.sunatCode)]) : '',
      l.plate
        ? group('cac:AdditionalItemProperty', [
            el('cbc:Name', 'Gastos Art. 37 Renta: Número de Placa'),
            el('cbc:NameCode', '7000'),
            el('cbc:Value', l.plate),
          ])
        : '',
    ]),
    group('cac:Price', [el('cbc:PriceAmount', fmtTrim(l.unitValue, 10, 2), cur)]),
  ]);
}

/** XML UBL 2.1 (sin firmar) de una factura, boleta, nota de crédito o nota de débito. */
export function saleDocumentXml(doc: SaleDocument): string {
  const root = ROOTS[doc.type];
  const isInvoice = doc.type === '01' || doc.type === '03';
  const cur = { currencyID: doc.currency };

  const body = [
    EXTENSIONS,
    el('cbc:UBLVersionID', '2.1'),
    el('cbc:CustomizationID', '2.0'),
    el('cbc:ID', `${doc.series}-${doc.number}`),
    el('cbc:IssueDate', doc.issueDate),
    el('cbc:IssueTime', doc.issueTime),
    isInvoice ? el('cbc:DueDate', doc.dueDate) : '',
    isInvoice ? el('cbc:InvoiceTypeCode', doc.type, { listID: doc.operationType }) : '',
    ...doc.legends.map((l) => el('cbc:Note', l.value, { languageLocaleID: l.code })),
    el('cbc:Note', doc.observation),
    el('cbc:DocumentCurrencyCode', doc.currency),
    doc.note
      ? group('cac:DiscrepancyResponse', [
          el('cbc:ReferenceID', doc.note.affectedId),
          el('cbc:ResponseCode', doc.note.code),
          el('cbc:Description', doc.note.reason),
        ])
      : '',
    doc.purchaseOrder ? group('cac:OrderReference', [el('cbc:ID', doc.purchaseOrder)]) : '',
    doc.note
      ? group('cac:BillingReference', [
          group('cac:InvoiceDocumentReference', [el('cbc:ID', doc.note.affectedId), el('cbc:DocumentTypeCode', doc.note.affectedType)]),
        ])
      : '',
    ...doc.prepayments.map((p, i) =>
      group('cac:AdditionalDocumentReference', [
        el('cbc:ID', p.id),
        el('cbc:DocumentTypeCode', p.docType),
        el('cbc:DocumentStatusCode', i + 1),
        group('cac:IssuerParty', [group('cac:PartyIdentification', [el('cbc:ID', doc.issuer.ruc, { schemeID: '6' })])]),
      ]),
    ),
    signatureRef(doc.issuer),
    supplier(doc.issuer),
    customer(doc),
    paymentTerms(doc),
    ...doc.prepayments.map((p, i) => group('cac:PrepaidPayment', [el('cbc:ID', i + 1), el('cbc:PaidAmount', fmt(p.amount), cur)])),
    ...doc.allowances.map((a) => allowance(a, doc.currency)),
    taxTotal(doc),
    monetaryTotal(doc, root.totals),
    ...doc.lines.map((l) => line(l, doc, root)),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root.tag} xmlns="${esc(root.ns)}"${UBL_NAMESPACES}>${body.join('')}</${root.tag}>`;
}
