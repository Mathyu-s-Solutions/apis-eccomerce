import { z } from 'zod';

const correlative = z
  .union([z.number().int(), z.string().trim().regex(/^\d{1,8}$/)], { error: 'numero debe ser un entero entre 1 y 99999999' })
  .transform(Number)
  .refine((n) => n >= 1 && n <= 99_999_999, 'numero debe ser un entero entre 1 y 99999999');

const series = z.string({ error: 'El campo serie es requerido' }).trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{3}$/, 'serie debe tener 4 caracteres');

const STATUS_DOCUMENTS = ['factura', 'boleta', 'nota_credito', 'nota_debito', 'guia_remision_remitente', 'guia_remision_transportista', 'resumen_diario', 'comunicacion_baja'] as const;

/** POST /sunat/status */
export const StatusSchema = z.object({
  documento: z.enum(STATUS_DOCUMENTS, { error: 'El campo documento es requerido (factura, boleta, nota_credito, nota_debito, guia_remision_remitente, guia_remision_transportista)' }),
  // Resúmenes y bajas: la serie es "RC-AAAAMMDD" o "RA-AAAAMMDD".
  serie: z.string({ error: 'El campo serie es requerido' }).trim().toUpperCase().regex(/^([A-Z][A-Z0-9]{3}|R[AC]-\d{8})$/, 'serie debe tener 4 caracteres'),
  numero: correlative,
});
export type StatusDto = z.infer<typeof StatusSchema>;

const VoidedTargetSchema = z.object({
  documento: z.enum(['factura', 'boleta', 'nota_credito', 'nota_debito'], { error: 'documento_afectado.documento debe ser factura, boleta, nota_credito o nota_debito' }),
  serie: series,
  numero: correlative,
  // Solo para comprobantes que no se emitieron con esta API.
  fecha_de_emision: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_de_emision debe tener el formato AAAA-MM-DD').optional(),
});

/** POST /sunat/voided: comunicación de baja. */
export const VoidedSchema = z
  .object({
    documento: z.literal('comunicacion_baja').optional(),
    motivo: z.string().trim().min(3, 'motivo es requerido').max(100).default('ANULACIÓN DE OPERACIÓN'),
    documento_afectado: VoidedTargetSchema.optional(),
    documentos_afectados: z.array(VoidedTargetSchema).min(1).max(100).optional(),
  })
  .refine((d) => d.documento_afectado || d.documentos_afectados, { path: ['documento_afectado'], message: 'El campo documento_afectado es requerido' });
export type VoidedDto = z.infer<typeof VoidedSchema>;

const ACTIONS: Record<string, '1' | '2' | '3'> = {
  adicionar: '1',
  agregar: '1',
  emitir: '1',
  informar: '1',
  modificar: '2',
  anular: '3',
  anulacion: '3',
  anulación: '3',
};
const action = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v in ACTIONS, 'accion_resumen debe ser adicionar, modificar o anular')
  .transform((v) => ACTIONS[v]);

/** POST /sunat/daily-summary: resumen diario de boletas y sus notas. */
export const DailySummarySchema = z.object({
  documento: z.literal('resumen_diario').optional(),
  documentos_afectados: z
    .array(
      z
        .object({
          documento: z.enum(['boleta', 'nota_credito', 'nota_debito'], { error: 'documentos_afectados.documento debe ser boleta, nota_credito o nota_debito' }),
          serie: series.refine((s) => s.startsWith('B'), 'El resumen diario es de boletas y sus notas: la serie empieza con B'),
          numero: correlative,
          accion_resumen: action.optional(),
          // apisunat.pe documenta los dos nombres.
          tipo_operacion: action.optional(),
        })
        .transform((d) => ({ documento: d.documento, serie: d.serie, numero: d.numero, accion: d.accion_resumen ?? d.tipo_operacion ?? ('3' as const) })),
      { error: 'El campo documentos_afectados es requerido' },
    )
    .min(1, 'documentos_afectados necesita al menos un comprobante')
    .max(500),
});
export type DailySummaryDto = z.infer<typeof DailySummarySchema>;

const LIST_DOCUMENTS = ['factura', 'boleta', 'nota_credito', 'nota_debito', 'guia_remision_remitente', 'guia_remision_transportista', 'resumen_diario', 'comunicacion_baja'] as const;
const day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD');

/** GET /sunat/documents */
export const DocumentsQuerySchema = z.object({
  documento: z.enum(LIST_DOCUMENTS).optional(),
  serie: z.string().trim().toUpperCase().max(11).optional(),
  estado: z.enum(['PENDIENTE', 'ACEPTADO', 'RECHAZADO', 'ANULADO']).optional(),
  desde: day.optional(),
  hasta: day.optional(),
  cliente: z.string().trim().max(15).optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});
export type DocumentsQueryDto = z.infer<typeof DocumentsQuerySchema>;
