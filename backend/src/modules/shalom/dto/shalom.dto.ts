import { z } from 'zod';

export const ShalomTrackSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .regex(/^\d{6,12}$/, 'La guía debe tener entre 6 y 12 dígitos'),
  orderCode: z
    .string()
    .trim()
    .min(4)
    .max(6)
    .describe('Clave de la guía (la que figura en el comprobante)'),
});
export type ShalomTrackDto = z.infer<typeof ShalomTrackSchema>;

export const ShalomStatusSchema = z.object({
  oseId: z.string().trim().min(1, 'oseId requerido'),
});
export type ShalomStatusDto = z.infer<typeof ShalomStatusSchema>;

/** Cotización entre dos agencias (su `code` de GET /agencies). */
export const ShalomQuoteSchema = z.object({
  origin: z.string().trim().regex(/^\d{1,6}$/, 'origin: el code de la agencia de origen'),
  destination: z.string().trim().regex(/^\d{1,6}$/, 'destination: el code de la agencia de destino'),
  air: z.boolean().optional(),
  homeDelivery: z.boolean().optional(),
});
export type ShalomQuoteDto = z.infer<typeof ShalomQuoteSchema>;

/** Cada guía resuelve un captcha: hasta 20 por llamada. */
export const SHALOM_BATCH_MAX = 20;
export const ShalomTrackBatchSchema = z.object({
  orders: z.array(ShalomTrackSchema).min(1).max(SHALOM_BATCH_MAX),
});
export type ShalomTrackBatchDto = z.infer<typeof ShalomTrackBatchSchema>;
