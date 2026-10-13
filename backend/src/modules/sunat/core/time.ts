/** Fecha y hora de Lima (UTC-5, sin horario de verano): la que espera SUNAT. */
export function limaNow(now = new Date()): { date: string; time: string } {
  const lima = new Date(now.getTime() - 5 * 3_600_000).toISOString();
  return { date: lima.slice(0, 10), time: lima.slice(11, 19) };
}
