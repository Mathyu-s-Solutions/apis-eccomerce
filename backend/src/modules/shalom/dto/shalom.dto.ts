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

export const ShalomAgenciesQuerySchema = z.object({
  q: z.string().trim().optional(),
  department: z.string().trim().optional(),
  province: z.string().trim().optional(),
});
export type ShalomAgenciesQueryDto = z.infer<typeof ShalomAgenciesQuerySchema>;
