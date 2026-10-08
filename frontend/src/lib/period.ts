// Periodo de cuota YYYYMM en UTC. Debe coincidir con el backend.
export function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
