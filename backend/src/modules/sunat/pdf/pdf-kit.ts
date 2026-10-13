import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export type Pdf = InstanceType<typeof PDFDocument>;

export const FONT = { regular: 'Helvetica', bold: 'Helvetica-Bold' } as const;
export const COLOR = { text: '#1b1f24', muted: '#5d6470', line: '#c9ced6', fill: '#f2f4f7', warn: '#b42318' } as const;

/** Reúne el PDF en memoria. */
export function render(options: PDFKit.PDFDocumentOptions, draw: (doc: Pdf) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: true, bufferPages: true, ...options });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc);
      doc.end();
    } catch (e) {
      reject(e as Error);
    }
  });
}

/** Dibuja un QR como vectores (sin imágenes intermedias). */
export function drawQr(doc: Pdf, text: string, x: number, y: number, size: number): void {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'Q' });
  const n = qr.modules.size;
  const cell = size / n;
  doc.save().fillColor('#000000');
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.modules.data[row * n + col]) doc.rect(x + col * cell, y + row * cell, cell + 0.2, cell + 0.2);
    }
  }
  doc.fill().restore();
}

/** "1234567.5" → "1,234,567.50" */
export function money(value: string): string {
  const [int, frac = ''] = value.split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac.padEnd(2, '0')}`;
}

/** "2026-10-12" → "12/10/2026" */
export function dmy(date: string | null | undefined): string {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}
