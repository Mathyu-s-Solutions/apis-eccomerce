/**
 * Fechas de vencimiento de los planes. Un plan vence al final de un día de Lima
 * (UTC-5) y se renueva siempre el mismo día del mes: quien vence el 25 vuelve a
 * vencer el 25 del mes siguiente, aunque pague tarde.
 */

const LIMA_OFFSET_MS = 5 * 3_600_000;

/** "2026-10-25" → 2026-10-25 23:59:59.999 en Lima. */
export function endOfLimaDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) + LIMA_OFFSET_MS);
}

/** Día del mes (en Lima) de una fecha. */
function limaParts(date: Date): { y: number; m: number; d: number; ms: number } {
  const lima = new Date(date.getTime() - LIMA_OFFSET_MS);
  return { y: lima.getUTCFullYear(), m: lima.getUTCMonth(), d: lima.getUTCDate(), ms: lima.getTime() % 86_400_000 };
}

/** Suma meses conservando el día y la hora de Lima (el 31 cae en el último día de los meses cortos). */
export function addMonthsKeepingDay(from: Date, months: number): Date {
  const { y, m, d, ms } = limaParts(from);
  const target = new Date(Date.UTC(y, m + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)) + ms + LIMA_OFFSET_MS);
}

/**
 * Nuevo vencimiento al pagar `months` meses (uno, por defecto) de `plan`:
 *  - mismo plan y vigente: esos meses después del vencimiento actual;
 *  - mismo plan pero vencido: desde el siguiente vencimiento en su mismo día del mes;
 *  - sin plan u otro plan: esos meses desde hoy.
 * Un plan sin vencimiento (asignado a mano) se queda sin vencimiento.
 */
export function renewedExpiry(
  current: { plan: string; expiresAt: Date | null } | null,
  plan: string,
  now = new Date(),
  months = 1,
): Date | null {
  if (current?.plan === plan) {
    if (!current.expiresAt) return null;
    if (current.expiresAt > now) return addMonthsKeepingDay(current.expiresAt, months);
    for (let k = 1; k < 1200; k++) {
      // Desde el ancla, no encadenando: quien vence el 31 sigue venciendo el 31.
      if (addMonthsKeepingDay(current.expiresAt, k) > now) return addMonthsKeepingDay(current.expiresAt, k + months - 1);
    }
  }
  return addMonthsKeepingDay(now, months);
}

/**
 * Suma días a un vencimiento (una cortesía): desde el vencimiento si sigue vigente,
 * o desde el final de hoy si ya venció. Siempre vence al final de un día de Lima.
 */
export function extendedExpiry(expiresAt: Date | null, days: number, now = new Date()): Date {
  const base = expiresAt && expiresAt > now ? expiresAt : endOfLimaDay(limaDay(now));
  return endOfLimaDay(limaDay(new Date(base.getTime() + days * 86_400_000)));
}

/** Días de calendario de Lima hasta una fecha: 0 = hoy, 1 = mañana, -1 = ayer. */
export function limaDaysUntil(date: Date, now = new Date()): number {
  const day = (d: Date) => Date.parse(`${limaDay(d)}T00:00:00Z`);
  return Math.round((day(date) - day(now)) / 86_400_000);
}

/** "vence hoy", "vence mañana", "en 3 días", "venció ayer", "hace 4 días". */
export function relativeExpiry(date: Date, now = new Date()): string {
  const days = limaDaysUntil(date, now);
  if (days === 0) return date > now ? 'vence hoy' : 'venció hoy';
  if (days === 1) return 'vence mañana';
  if (days === -1) return 'venció ayer';
  return days > 0 ? `en ${days} días` : `hace ${-days} días`;
}

/** "2026-11-20": el día de Lima de una fecha (para un <input type="date">). */
export function limaDay(date: Date): string {
  const { y, m, d } = limaParts(date);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
