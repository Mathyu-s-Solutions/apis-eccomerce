/** Monto en letras para la leyenda 1000: "SEISCIENTOS CON 00/100 SOLES". */

const UNITS = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const TEENS = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const TWENTIES = ['VEINTE', 'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const TENS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const HUNDREDS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

export const CURRENCY_NAMES: Record<string, { plural: string; symbol: string }> = {
  PEN: { plural: 'SOLES', symbol: 'S/' },
  USD: { plural: 'DÓLARES AMERICANOS', symbol: '$' },
  EUR: { plural: 'EUROS', symbol: '€' },
};

function below1000(n: number): string {
  if (n === 100) return 'CIEN';
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS[h]!);
  if (rest >= 30) {
    const u = rest % 10;
    parts.push(u ? `${TENS[Math.floor(rest / 10)]} Y ${UNITS[u]}` : TENS[Math.floor(rest / 10)]!);
  } else if (rest >= 20) parts.push(TWENTIES[rest - 20]!);
  else if (rest >= 10) parts.push(TEENS[rest - 10]!);
  else if (rest > 0) parts.push(UNITS[rest]!);
  return parts.join(' ');
}

/** "UNO" final pasa a "UN" delante de MIL / MILLONES. */
const apocope = (s: string) => s.replace(/UNO$/, 'UN');

export function integerInWords(n: number): string {
  if (n === 0) return 'CERO';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? 'UN MILLON' : `${apocope(integerInWords(millions))} MILLONES`);
  if (thousands) parts.push(thousands === 1 ? 'MIL' : `${apocope(below1000(thousands))} MIL`);
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}

/** `amount` con dos decimales ("600.00"). */
export function amountInWords(amount: string, currency: string): string {
  const [int = '0', cents = '00'] = amount.replace('-', '').split('.');
  const name = CURRENCY_NAMES[currency]?.plural ?? currency;
  return `${integerInWords(Number(int))} CON ${cents.padEnd(2, '0').slice(0, 2)}/100 ${name}`;
}
