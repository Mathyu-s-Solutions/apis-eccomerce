import type { FastifyRequest } from 'fastify';
import type { AppConfig } from '../../config/configuration';

/** URL pública de la API para armar los enlaces de descarga. */
export function baseUrl(config: AppConfig, req: FastifyRequest): string {
  return config.publicUrl ?? `${req.protocol}://${req.host}`;
}
