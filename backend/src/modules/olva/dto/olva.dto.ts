import { z } from 'zod';
import { RawQuerySchema } from '../../../common/courier/raw-query';

export const OlvaTrackSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .regex(/^\d{6,15}$/, 'El número de guía/remito debe tener entre 6 y 15 dígitos'),
  orderCode: z
    .string()
    .trim()
    .regex(/^\d{2,4}$/, 'El código (año de emisión) debe tener 2 a 4 dígitos')
    .optional(),
});
export type OlvaTrackDto = z.infer<typeof OlvaTrackSchema>;

export const OlvaTrackBatchSchema = z.object({
  orders: z.array(OlvaTrackSchema).min(1).max(50),
});
export type OlvaTrackBatchDto = z.infer<typeof OlvaTrackBatchSchema>;

export const OlvaQuoteSchema = z.object({
  origin: z.string().regex(/^\d{6}$/, 'origin debe ser un ubigeo de 6 dígitos'),
  destination: z
    .string()
    .regex(/^\d{6}$/, 'destination debe ser un ubigeo de 6 dígitos'),
  deliveryType: z.enum(['D', 'O']).default('O'), // D=domicilio, O=oficina
  shipmentType: z.coerce.number().int().refine((n) => n === 1 || n === 2, {
    message: 'shipmentType: 1 (sobre) o 2 (paquete)',
  }),
  weight: z.coerce.number().positive(),
  length: z.coerce.number().positive().optional(),
  width: z.coerce.number().positive().optional(),
  height: z.coerce.number().positive().optional(),
  partnerRate: z.coerce.boolean().default(false),
});
export type OlvaQuoteDto = z.infer<typeof OlvaQuoteSchema>;

export const OlvaAgenciesQuerySchema = RawQuerySchema.extend({
  q: z.string().trim().optional(),
  department: z.string().trim().optional(),
  province: z.string().trim().optional(),
});
export type OlvaAgenciesQueryDto = z.infer<typeof OlvaAgenciesQuerySchema>;
