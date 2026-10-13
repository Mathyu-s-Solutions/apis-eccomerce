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
 * Nuevo vencimiento al pagar un mes de `plan`:
 *  - mismo plan y vigente: un mes después del vencimiento actual;
 *  - mismo plan pero vencido: el siguiente vencimiento en su mismo día del mes;
 *  - sin plan u otro plan: un mes desde hoy.
 * Un plan sin vencimiento (asignado a mano) se queda sin vencimiento.
 */
export function renewedExpiry(current: { plan: string; expiresAt: Date | null } | null, plan: string, now = new Date()): Date | null {
  if (current?.plan === plan) {
    if (!current.expiresAt) return null;
    if (current.expiresAt > now) return addMonthsKeepingDay(current.expiresAt, 1);
    for (let k = 1; k < 1200; k++) {
      const next = addMonthsKeepingDay(current.expiresAt, k);
      if (next > now) return next;
    }
  }
  return addMonthsKeepingDay(now, 1);
}
