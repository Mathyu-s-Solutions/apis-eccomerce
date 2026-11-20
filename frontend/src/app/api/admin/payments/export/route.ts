import { forbidden, getAdmin, listPayments, type PaymentFilter } from '@/lib/admin';
import { paymentMethodLabel } from '@/lib/plans';

const FILTERS: PaymentFilter[] = ['pending', 'approved', 'rejected', 'all'];
const STATUS: Record<string, string> = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' };

/** "2026-11-20 00:36", en hora de Lima. */
function limaDateTime(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
}

/** Un valor de CSV: entre comillas si hace falta, y sin fórmulas (Excel ejecuta las que empiezan con = + - @). */
function cell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Pagos en CSV (para la contabilidad): los del filtro de la página, con la búsqueda.
export async function GET(request: Request) {
  if (!(await getAdmin())) return forbidden();

  const params = new URL(request.url).searchParams;
  const status = FILTERS.find((f) => f === params.get('status')) ?? 'approved';
  const payments = await listPayments(status, params.get('q') ?? '', 10_000);

  const rows = [
    ['Fecha (Lima)', 'Cliente', 'Correo', 'Compra', 'Monto (S/)', 'Método', 'N° operación', 'Estado', 'Revisado por', 'Revisado (Lima)', 'Nota'],
    ...payments.map((p) => [
      limaDateTime(p.createdAt),
      p.user.name,
      p.user.email,
      p.label,
      p.amountPen,
      paymentMethodLabel(p.method),
      p.operationCode,
      STATUS[p.status] ?? p.status,
      p.reviewedBy,
      p.reviewedAt ? limaDateTime(p.reviewedAt) : null,
      p.note,
    ]),
  ];
  // BOM: Excel abre bien las tildes.
  const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  const day = limaDateTime(new Date().toISOString()).slice(0, 10);
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="pagos-${status}-${day}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
