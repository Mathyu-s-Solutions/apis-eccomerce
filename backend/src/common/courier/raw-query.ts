import { z } from 'zod';

/**
 * `?raw=1` agrega la respuesta cruda del courier. Va apagado por defecto: pesa
 * (la lista de Shalom pasa de ~0,35 MB a ~3 MB) y en el rastreo trae nombres y
 * documentos del remitente y del destinatario.
 */
export const RawQuerySchema = z.object({
  raw: z
    .enum(['1', '0', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});
export type RawQueryDto = z.infer<typeof RawQuerySchema>;

/** Quita `raw` salvo que se haya pedido. */
export function withRaw<T extends { raw?: unknown }>(item: T, include: boolean): T {
  if (include) return item;
  const { raw: _raw, ...rest } = item;
  return rest as T;
}
