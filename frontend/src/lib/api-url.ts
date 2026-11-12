const trim = (url?: string) => (url ?? '').replace(/\/+$/, '');

/**
 * URL base de la API que ven los clientes (documentación y ejemplos con curl).
 *
 * Con dominios propios (NEXT_PUBLIC_PANEL_URL), la API se publica en el dominio del panel,
 * https://apis.mathyusolutions.com/v1/...: next.config.ts reenvía /v1/* al backend en Cloud
 * Run (NEXT_PUBLIC_API_URL). Sin dominios propios (preview), es la del backend directo.
 *
 * Sin imports a propósito: lib/brands.ts la usa al cargarse y urls.ts importa brands.
 */
export const API_URL =
  trim(process.env.NEXT_PUBLIC_PANEL_URL) || trim(process.env.NEXT_PUBLIC_API_URL) || 'https://apis.mathyusolutions.com';
