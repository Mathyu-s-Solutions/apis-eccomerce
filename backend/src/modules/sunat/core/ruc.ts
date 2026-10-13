/** Validaciones de RUC y DNI (sin consultar a nadie). */

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Dígito verificador de un RUC (módulo 11) a partir de sus 10 primeros dígitos. */
export function rucCheckDigit(first10: string): number {
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(first10[i]), 0);
  const rest = 11 - (sum % 11);
  return rest === 10 ? 0 : rest === 11 ? 1 : rest;
}

export function isValidRuc(ruc: string): boolean {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  return rucCheckDigit(ruc.slice(0, 10)) === Number(ruc[10]);
}

export function isValidDni(dni: string): boolean {
  return /^\d{8}$/.test(dni);
}

/** RUC de persona natural que le corresponde a un DNI (10 + DNI + verificador). */
export function rucFromDni(dni: string): string {
  const base = `10${dni}`;
  return `${base}${rucCheckDigit(base)}`;
}
