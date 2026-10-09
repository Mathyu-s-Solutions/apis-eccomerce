import { z } from 'zod';

export const WebhookConfigSchema = z.object({
  url: z.string().trim().min(1).max(500),
  enabled: z.boolean().optional(),
  rotateSecret: z.boolean().optional(),
});
export type WebhookConfigDto = z.infer<typeof WebhookConfigSchema>;

export const DeliveriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type DeliveriesQueryDto = z.infer<typeof DeliveriesQuerySchema>;

export const SubscriptionsListQuerySchema = z.object({
  includeInactive: z
    .enum(['1', '0', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});
export type SubscriptionsListQueryDto = z.infer<typeof SubscriptionsListQuerySchema>;

export const UnsubscribeQuerySchema = z.object({
  orderNumber: z.string().trim().regex(/^\d{6,15}$/, 'orderNumber: el número de la guía'),
});
export type UnsubscribeQueryDto = z.infer<typeof UnsubscribeQuerySchema>;
