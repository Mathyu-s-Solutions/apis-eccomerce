import type { ApiKeyRecord } from '../../auth/api-key.store';

/**
 * Lo que el guard de la key, la cuota y el filtro de errores dejan en la request para el
 * registro de requests (RequestLogService), que lo lee al responder.
 */
export interface RequestLogProps {
  /** La key, aunque el guard la rechace después (p. ej. key de otra API). */
  key?: ApiKeyRecord;
  /** API de la ruta (@ForProduct). */
  product?: string;
  /** Cuota cobrada (solo si el handler respondió bien). */
  units?: number;
  /** El error que recibió el cliente. */
  error?: { message: string; upstream?: string };
}

const PROP = Symbol('requestLog');

export function logProps(req: object): RequestLogProps {
  const r = req as { [PROP]?: RequestLogProps };
  return (r[PROP] ??= {});
}
