import 'server-only';

/**
 * Datos de quien ofrece el servicio, para los términos y la política de privacidad.
 * Si tienes RUC o domicilio fiscal, agrégalos aquí y aparecen en las dos páginas.
 */
export const LEGAL = {
  owner: "Mathyu's Solutions",
  ruc: null as string | null,
  address: null as string | null,
  /** Fecha de la versión vigente de los textos (cámbiala cuando los edites). */
  updatedAt: '13 de octubre de 2026',
};

/** Correo de contacto público (términos, privacidad, footer). CONTACT_EMAIL lo cambia sin tocar el código. */
export function contactEmail(): string {
  return process.env.CONTACT_EMAIL || 'mathyusolutions@gmail.com';
}
