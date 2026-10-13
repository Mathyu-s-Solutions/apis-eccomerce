import { CURRENCY_NAMES } from '../core/amount-in-words';
import { CREDIT_NOTE_TYPES, DEBIT_NOTE_TYPES, DETRACTIONS, DOCUMENT_NAMES, IDENTITY_TYPES } from '../core/catalogs';
import { type Dec, fmt, fmtTrim, isZero } from '../core/decimal';
import type { SaleDocument } from '../ubl/model';
import { COLOR, FONT, type Pdf, dmy, drawQr, money, render } from './pdf-kit';

export interface SalePdfContext {
  hash: string | null;
  /** ACEPTADO, PENDIENTE, RECHAZADO o ANULADO. */
  status: string;
  environment: string;
  logo?: Buffer | null;
  phone?: string | null;
  email?: string | null;
}

/** Contenido del QR que pide SUNAT en la representación impresa. */
export function qrText(doc: SaleDocument, hash: string | null): string {
  return [doc.issuer.ruc, doc.type, doc.series, doc.number, fmt(doc.totals.igv), fmt(doc.totals.payable), doc.issueDate, doc.customer.docType, doc.customer.docNumber, hash ?? ''].join('|') + '|';
}

const symbol = (doc: SaleDocument) => CURRENCY_NAMES[doc.currency]?.symbol ?? doc.currency;
const amount = (doc: SaleDocument, v: Dec) => `${symbol(doc)} ${money(fmt(v))}`;

/** Filas del cuadro de totales (solo las que tienen monto). */
function totalRows(doc: SaleDocument): Array<[string, string, boolean?]> {
  const t = doc.totals;
  const rows: Array<[string, string, boolean?]> = [];
  const push = (label: string, v: Dec, always = false) => {
    if (always || !isZero(v)) rows.push([label, amount(doc, v)]);
  };
  push('Op. gravadas', t.gravadas, isZero(t.exoneradas) && isZero(t.inafectas) && isZero(t.exportacion) && isZero(t.gratuitas));
  push('Op. exoneradas', t.exoneradas);
  push('Op. inafectas', t.inafectas);
  push('Op. exportación', t.exportacion);
  push('Op. gratuitas', t.gratuitas);
  push(`IGV (${fmtTrim(doc.igvPercent, 2)}%)`, t.igv, true);
  push('Descuentos', t.discounts);
  push('Anticipos', t.prepaid);
  rows.push(['IMPORTE TOTAL', amount(doc, t.payable), true]);
  return rows;
}

function extraNotes(doc: SaleDocument): string[] {
  const notes: string[] = [];
  if (doc.payment?.type === 'Credito') {
    notes.push(`Forma de pago: crédito. Pendiente de pago: ${amount(doc, doc.payment.pending!)}.`);
    doc.payment.installments.forEach((c, i) => notes.push(`  Cuota ${i + 1}: ${amount(doc, c.amount)}, vence el ${dmy(c.dueDate)}.`));
  }
  if (doc.detraction) {
    const d = doc.detraction;
    notes.push(`Operación sujeta a detracción: ${DETRACTIONS[d.code]?.description ?? d.code} (${fmtTrim(d.percent, 3)}%), S/ ${money(fmt(d.amount))}. Cuenta del Banco de la Nación: ${d.account}.`);
  }
  if (doc.retention) notes.push(`Retención del IGV (${fmtTrim(doc.retention.percent, 2)}%): ${amount(doc, doc.retention.amount)}.`);
  for (const l of doc.lines) if (l.plate) notes.push(`Ítem ${l.index}: placa ${l.plate}.`);
  if (doc.totals.gratuitas > 0n) notes.push('TRANSFERENCIA GRATUITA DE UN BIEN Y/O SERVICIO PRESTADO GRATUITAMENTE.');
  if (doc.observation) notes.push(`Observación: ${doc.observation}`);
  return notes;
}

function noteLines(doc: SaleDocument): Array<[string, string]> {
  if (!doc.note) return [];
  const types = doc.type === '07' ? CREDIT_NOTE_TYPES : DEBIT_NOTE_TYPES;
  return [
    ['Documento que modifica', `${doc.note.affectedType === '01' ? 'Factura' : 'Boleta'} ${doc.note.affectedId}`],
    ['Tipo de nota', `${doc.note.code} - ${types[doc.note.code] ?? ''}`],
    ['Motivo', doc.note.reason],
  ];
}

function statusBanner(ctx: SalePdfContext): string | null {
  if (ctx.environment !== 'produccion') return 'DOCUMENTO DE PRUEBA (SUNAT BETA) - SIN VALIDEZ TRIBUTARIA';
  if (ctx.status === 'ANULADO') return 'COMPROBANTE ANULADO';
  if (ctx.status === 'RECHAZADO') return 'COMPROBANTE RECHAZADO POR SUNAT - SIN VALIDEZ';
  if (ctx.status === 'PENDIENTE') return 'PENDIENTE DE ENVÍO A SUNAT';
  return null;
}

const title = (doc: SaleDocument) => DOCUMENT_NAMES[doc.type];
const customerDocLabel = (doc: SaleDocument) => IDENTITY_TYPES[doc.customer.docType]?.split(' ')[0].replace('DOC.TRIB.NO.DOM.SIN.RUC', 'DOC.') ?? 'DOC.';
const footer = (doc: SaleDocument) => `Representación impresa de la ${title(doc)}.`;

// ---------------------------------------------------------------- A4

export function saleA4(doc: SaleDocument, ctx: SalePdfContext): Promise<Buffer> {
  return render({ size: 'A4', margin: 36, info: { Title: `${title(doc)} ${doc.series}-${doc.number}`, Author: doc.issuer.razonSocial } }, (pdf) => {
    const left = 36;
    const width = pdf.page.width - 72;
    const right = left + width;
    const boxW = 190;

    // Cabecera: emisor a la izquierda, recuadro del comprobante a la derecha.
    let x = left;
    if (ctx.logo) {
      try {
        pdf.image(ctx.logo, left, 36, { fit: [90, 62] });
        x = left + 100;
      } catch {
        // Un logo ilegible no impide el PDF.
      }
    }
    const headW = right - boxW - 12 - x;
    pdf.font(FONT.bold).fontSize(13).fillColor(COLOR.text).text(doc.issuer.nombreComercial || doc.issuer.razonSocial, x, 38, { width: headW });
    pdf.font(FONT.regular).fontSize(8.5).fillColor(COLOR.muted);
    if (doc.issuer.nombreComercial) pdf.text(doc.issuer.razonSocial, { width: headW });
    pdf.text([doc.issuer.direccion, [doc.issuer.distrito, doc.issuer.provincia, doc.issuer.departamento].filter(Boolean).join(' - ')].filter(Boolean).join(', '), { width: headW });
    const contact = [ctx.phone && `Tel. ${ctx.phone}`, ctx.email].filter(Boolean).join('  ·  ');
    if (contact) pdf.text(contact, { width: headW });
    const headBottom = pdf.y;

    pdf.roundedRect(right - boxW, 36, boxW, 70, 6).lineWidth(1.2).strokeColor(COLOR.text).stroke();
    pdf.font(FONT.bold).fontSize(11).fillColor(COLOR.text).text(`RUC ${doc.issuer.ruc}`, right - boxW, 46, { width: boxW, align: 'center' });
    pdf.fontSize(10).text(title(doc), right - boxW + 8, 62, { width: boxW - 16, align: 'center' });
    pdf.fontSize(12).text(`${doc.series}-${doc.number}`, right - boxW, pdf.y + 3, { width: boxW, align: 'center' });

    let y = Math.max(headBottom, 112) + 10;
    const banner = statusBanner(ctx);
    if (banner) {
      pdf.rect(left, y, width, 18).fill('#fdecec');
      pdf.font(FONT.bold).fontSize(8.5).fillColor(COLOR.warn).text(banner, left, y + 5, { width, align: 'center' });
      y += 26;
    }

    // Datos del cliente y del comprobante, en dos columnas.
    const info: Array<[string, string]> = [
      ['Señor(es)', doc.customer.name],
      [customerDocLabel(doc), doc.customer.docNumber],
      ['Dirección', doc.customer.address ?? '-'],
      ...noteLines(doc),
    ];
    const meta: Array<[string, string]> = [
      ['Fecha de emisión', dmy(doc.issueDate)],
      ...(doc.dueDate ? ([['Fecha de vencimiento', dmy(doc.dueDate)]] as Array<[string, string]>) : []),
      ['Moneda', CURRENCY_NAMES[doc.currency]?.plural ?? doc.currency],
      ...(doc.payment ? ([['Forma de pago', doc.payment.type === 'Credito' ? 'Crédito' : 'Contado']] as Array<[string, string]>) : []),
      ...(doc.purchaseOrder ? ([['Orden de compra', doc.purchaseOrder]] as Array<[string, string]>) : []),
    ];
    const colW = width * 0.6;
    const pairs = (rows: Array<[string, string]>, px: number, w: number, labelW: number) => {
      let py = y + 8;
      for (const [label, value] of rows) {
        pdf.font(FONT.bold).fontSize(8.5).fillColor(COLOR.text).text(`${label}:`, px, py, { width: labelW });
        pdf.font(FONT.regular).text(value, px + labelW, py, { width: w - labelW - 6 });
        py = Math.max(pdf.y, py + 11) + 2;
      }
      return py;
    };
    const bottom = Math.max(pairs(info, left + 8, colW, 96), pairs(meta, left + colW + 8, width - colW - 8, 92)) + 4;
    pdf.roundedRect(left, y, width, bottom - y, 4).lineWidth(0.6).strokeColor(COLOR.line).stroke();
    y = bottom + 10;

    // Detalle.
    const cols = [
      { title: 'CANT.', w: 46, align: 'right' as const },
      { title: 'UM', w: 30, align: 'center' as const },
      { title: 'CÓDIGO', w: 56, align: 'left' as const },
      { title: 'DESCRIPCIÓN', w: 0, align: 'left' as const },
      { title: 'V. UNIT.', w: 62, align: 'right' as const },
      { title: 'P. UNIT.', w: 62, align: 'right' as const },
      { title: 'IMPORTE', w: 66, align: 'right' as const },
    ];
    cols[3].w = width - cols.reduce((s, c) => s + c.w, 0);
    const header = () => {
      pdf.rect(left, y, width, 16).fill(COLOR.fill);
      let cx = left;
      pdf.font(FONT.bold).fontSize(7.5).fillColor(COLOR.text);
      for (const c of cols) {
        pdf.text(c.title, cx + 3, y + 5, { width: c.w - 6, align: c.align });
        cx += c.w;
      }
      y += 18;
    };
    header();
    for (const l of doc.lines) {
      const free = l.affectation.free;
      const cells = [
        fmtTrim(l.quantity, 4),
        l.unit,
        l.code ?? '',
        free ? `${l.description} (gratuito)` : l.description,
        money(fmtTrim(free ? l.unitPrice : l.unitValue, 6, 2)),
        money(fmtTrim(l.unitPrice, 6, 2)),
        money(fmt(free ? l.value : l.total)),
      ];
      pdf.font(FONT.regular).fontSize(8);
      const h = Math.max(...cells.map((c, i) => pdf.heightOfString(c, { width: cols[i].w - 6 }))) + 5;
      if (y + h > pdf.page.height - 60) {
        pdf.addPage();
        y = 40;
        header();
      }
      let cx = left;
      pdf.font(FONT.regular).fontSize(8).fillColor(COLOR.text);
      cells.forEach((c, i) => {
        pdf.text(c, cx + 3, y + 2, { width: cols[i].w - 6, align: cols[i].align });
        cx += cols[i].w;
      });
      y += h;
      pdf.moveTo(left, y).lineTo(right, y).lineWidth(0.4).strokeColor(COLOR.line).stroke();
      for (const d of l.discounts) {
        pdf.font(FONT.regular).fontSize(7).fillColor(COLOR.muted).text(`Descuento: -${money(fmt(d.amount))}`, left + cols[0].w + cols[1].w + cols[2].w + 3, y + 2);
        y += 10;
      }
    }
    y += 8;

    // Totales (derecha), QR y notas (izquierda).
    const rows = totalRows(doc);
    const notes = extraNotes(doc);
    const totalsW = 210;
    const blockH = Math.max(rows.length * 15 + 8, 108);
    pdf.font(FONT.regular).fontSize(8);
    const notesH = notes.reduce((s, n) => s + pdf.heightOfString(n, { width: width - totalsW - 110 }) + 2, 0);
    if (y + Math.max(blockH, notesH + 30) > pdf.page.height - 50) {
      pdf.addPage();
      y = 40;
    }

    let ty = y;
    for (const [label, value, strong] of rows) {
      if (strong) pdf.rect(right - totalsW, ty - 2, totalsW, 16).fill(COLOR.fill);
      pdf.font(strong ? FONT.bold : FONT.regular).fontSize(strong ? 9.5 : 8.5).fillColor(COLOR.text);
      pdf.text(label, right - totalsW + 6, ty + 2, { width: 100 });
      pdf.text(value, right - 110, ty + 2, { width: 104, align: 'right' });
      ty += 15;
    }

    drawQr(pdf, qrText(doc, ctx.hash), left, y, 92);
    const nx = left + 102;
    const nw = width - totalsW - 110;
    pdf.font(FONT.bold).fontSize(8.5).fillColor(COLOR.text).text(`SON: ${doc.legends[0].value}`, nx, y, { width: nw });
    pdf.font(FONT.regular).fontSize(8).fillColor(COLOR.text);
    for (const n of notes) pdf.text(n, nx, pdf.y + 2, { width: nw });
    y = Math.max(ty, y + 98, pdf.y) + 8;

    pdf.font(FONT.regular).fontSize(7.5).fillColor(COLOR.muted);
    if (ctx.hash) pdf.text(`Valor resumen: ${ctx.hash}`, left, y, { width });
    pdf.text(`${footer(doc)} Consulte su validez en www.sunat.gob.pe con el RUC del emisor, la serie y el número.`, left, pdf.y + 2, { width });
  });
}

// ---------------------------------------------------------------- ticket (80 mm)

const TICKET_W = 226.77;

function drawTicket(pdf: Pdf, doc: SaleDocument, ctx: SalePdfContext): number {
  const m = 10;
  const w = TICKET_W - m * 2;
  let y = 12;
  const center = (text: string, size: number, bold = false, color: string = COLOR.text) => {
    pdf.font(bold ? FONT.bold : FONT.regular).fontSize(size).fillColor(color).text(text, m, y, { width: w, align: 'center' });
    y = pdf.y + 1;
  };
  const rule = () => {
    y += 3;
    pdf.moveTo(m, y).lineTo(m + w, y).lineWidth(0.5).dash(2, { space: 2 }).strokeColor(COLOR.muted).stroke().undash();
    y += 5;
  };
  const pair = (label: string, value: string, bold = false) => {
    pdf.font(bold ? FONT.bold : FONT.regular).fontSize(bold ? 9 : 7.5).fillColor(COLOR.text);
    const h = pdf.heightOfString(value, { width: w * 0.55, align: 'right' });
    pdf.text(label, m, y, { width: w * 0.45 });
    pdf.text(value, m + w * 0.45, y, { width: w * 0.55, align: 'right' });
    y += Math.max(h, 9) + 1;
  };
  const left = (text: string, size = 7.5, bold = false) => {
    pdf.font(bold ? FONT.bold : FONT.regular).fontSize(size).fillColor(COLOR.text).text(text, m, y, { width: w });
    y = pdf.y + 1;
  };

  if (ctx.logo) {
    try {
      pdf.image(ctx.logo, m + w / 2 - 35, y, { fit: [70, 44], align: 'center' });
      y += 48;
    } catch {
      // sin logo
    }
  }
  center(doc.issuer.nombreComercial || doc.issuer.razonSocial, 10, true);
  if (doc.issuer.nombreComercial) center(doc.issuer.razonSocial, 7.5);
  center(`RUC ${doc.issuer.ruc}`, 8.5, true);
  center(doc.issuer.direccion, 7);
  const contact = [ctx.phone && `Tel. ${ctx.phone}`, ctx.email].filter(Boolean).join(' · ');
  if (contact) center(contact, 7);
  rule();
  center(title(doc), 9, true);
  center(`${doc.series}-${doc.number}`, 10, true);
  const banner = statusBanner(ctx);
  if (banner) center(banner, 6.5, true, COLOR.warn);
  rule();
  left(`Fecha: ${dmy(doc.issueDate)} ${doc.issueTime}`);
  left(`Cliente: ${doc.customer.name}`);
  left(`${customerDocLabel(doc)}: ${doc.customer.docNumber}`);
  if (doc.customer.address && doc.customer.address !== '-') left(`Dirección: ${doc.customer.address}`);
  for (const [label, value] of noteLines(doc)) left(`${label}: ${value}`);
  rule();
  for (const l of doc.lines) {
    const free = l.affectation.free;
    left(free ? `${l.description} (gratuito)` : l.description, 7.5, true);
    pair(`${fmtTrim(l.quantity, 4)} ${l.unit} x ${money(fmtTrim(l.unitPrice, 6, 2))}`, money(fmt(free ? l.value : l.total)));
  }
  rule();
  for (const [label, value, strong] of totalRows(doc)) pair(label, value, strong);
  rule();
  left(`SON: ${doc.legends[0].value}`, 7);
  for (const n of extraNotes(doc)) left(n, 7);
  y += 6;
  drawQr(pdf, qrText(doc, ctx.hash), m + w / 2 - 45, y, 90);
  y += 96;
  if (ctx.hash) center(ctx.hash, 6, false, COLOR.muted);
  center(footer(doc), 6.5, false, COLOR.muted);
  center('Consulte su validez en www.sunat.gob.pe', 6.5, false, COLOR.muted);
  return y + 12;
}

/** Ticket de 80 mm: se dibuja dos veces, la primera solo para medir el alto. */
export async function saleTicket(doc: SaleDocument, ctx: SalePdfContext): Promise<Buffer> {
  let height = 0;
  await render({ size: [TICKET_W, 5000], margin: 0 }, (pdf) => {
    height = drawTicket(pdf, doc, ctx);
  });
  return render({ size: [TICKET_W, Math.ceil(height)], margin: 0, info: { Title: `${title(doc)} ${doc.series}-${doc.number}`, Author: doc.issuer.razonSocial } }, (pdf) => {
    drawTicket(pdf, doc, ctx);
  });
}
