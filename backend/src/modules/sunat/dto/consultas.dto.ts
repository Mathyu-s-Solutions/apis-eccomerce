import { z } from 'zod';
import { isValidRuc } from '../core/ruc';

/** Tipo de comprobante (nombre de la API o código del catálogo 01) → código que espera la consulta de validez. */
export const VALIDITY_TYPES: Record<string, string> = {
  factura: '01',
  boleta: '03',
  liquidacion_de_compra: '04',
  nota_credito: '07',
  nota_debito: '08',
  recibo_honorarios: 'R1',
  nota_credito_recibo: 'R7',
};
const CODES = new Set(Object.values(VALIDITY_TYPES));

/** dd/mm/aaaa o aaaa-mm-dd → aaaa-mm-dd */
const anyDate = z
  .string({ error: 'fecha_de_emision es requerido' })
  .trim()
  .transform((v) => {
    const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
    return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : v;
  })
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), 'fecha_de_emision debe tener el formato AAAA-MM-DD');

/** POST /sunat/cpe/validez */
export const ValiditySchema = z
  .object({
    ruc_emisor: z.string({ error: 'ruc_emisor es requerido' }).trim().refine(isValidRuc, 'ruc_emisor no es un RUC válido'),
    documento: z.string().trim().optional(),
    tipo_documento: z.string().trim().optional(),
    serie: z.string({ error: 'serie es requerido' }).trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/, 'serie tiene hasta 4 caracteres'),
    numero: z.union([z.number().int(), z.string().trim().regex(/^\d{1,8}$/)], { error: 'numero debe ser un entero' }).transform(Number),
    fecha_de_emision: anyDate,
    // Obligatorio para comprobantes electrónicos.
    total: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v), 'total debe ser un monto con hasta 2 decimales').optional(),
  })
  .transform((d, ctx) => {
    const raw = (d.tipo_documento ?? d.documento ?? '').toLowerCase();
    const code = VALIDITY_TYPES[raw] ?? (CODES.has(raw.toUpperCase()) ? raw.toUpperCase() : null);
    if (!code) {
      ctx.addIssue({ code: 'custom', path: ['documento'], message: `documento debe ser ${Object.keys(VALIDITY_TYPES).join(', ')} (o su código: 01, 03, 07…)` });
      return z.NEVER;
    }
    return { ruc: d.ruc_emisor, code, series: d.serie, number: d.numero, issueDate: d.fecha_de_emision, total: d.total ?? null };
  });
export type ValidityDto = z.infer<typeof ValiditySchema>;

const period = z
  .string({ error: 'period es requerido (AAAAMM)' })
  .trim()
  .regex(/^\d{6}$/, 'period debe tener el formato AAAAMM')
  .refine((v) => Number(v.slice(4)) >= 1 && Number(v.slice(4)) <= 12, 'period: el mes va de 01 a 12');
const day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD');

/** GET /sunat/rce y /sunat/rvie (mismos filtros que apisunat.pe). */
export const SireQuerySchema = z.object({
  period,
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
  start_date: day.optional(),
  end_date: day.optional(),
  document_type: z.string().trim().regex(/^\d{2}$/, 'document_type es un código de 2 dígitos (01, 03, 07, 08…)').optional(),
  document_ruc: z.string().trim().regex(/^\d{8,11}$/, 'document_ruc: el RUC o documento de la contraparte').optional(),
  // Vuelve a pedir la propuesta a SUNAT aunque esté en caché.
  refresh: z.enum(['1', '0', 'true', 'false']).optional().transform((v) => v === '1' || v === 'true'),
});
export type SireQueryDto = z.infer<typeof SireQuerySchema>;
