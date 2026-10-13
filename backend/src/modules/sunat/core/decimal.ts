/**
 * Decimales exactos para montos de comprobantes: punto fijo con 10 decimales
 * sobre BigInt. Con floats, 1.005 * 100 da 100.49999… y el IGV se iría un
 * céntimo, que es justo lo que SUNAT compara.
 */
export type Dec = bigint;

const PLACES = 10;
const SCALE = 10n ** BigInt(PLACES);

export const ZERO: Dec = 0n;

/** "254.237288", 18, "1e2"… a Dec. Lanza si no es un número. */
export function dec(value: string | number | bigint): Dec {
  if (typeof value === 'bigint') return value * SCALE;
  const s = typeof value === 'number' ? numberToPlain(value) : value.trim();
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) throw new Error(`Número inválido: ${String(value)}`);
  const [, sign, int = '', frac = ''] = m;
  // Más de 10 decimales: se redondea (mitad hacia arriba).
  const kept = frac.slice(0, PLACES).padEnd(PLACES, '0');
  let n = BigInt(int || '0') * SCALE + BigInt(kept || '0');
  if (frac.length > PLACES && Number(frac[PLACES]) >= 5) n += 1n;
  return sign === '-' ? -n : n;
}

function numberToPlain(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Número inválido: ${n}`);
  // toFixed evita la notación exponencial de números chicos.
  return Math.abs(n) < 1e-6 && n !== 0 ? n.toFixed(PLACES) : String(n);
}

/** División entera redondeando la mitad hacia arriba (lejos del cero). */
function divRound(a: bigint, b: bigint): bigint {
  const neg = a < 0n !== b < 0n;
  const [x, y] = [a < 0n ? -a : a, b < 0n ? -b : b];
  const q = (x * 2n + y) / (y * 2n);
  return neg ? -q : q;
}

export const add = (...xs: Dec[]): Dec => xs.reduce((s, x) => s + x, 0n);
export const sub = (a: Dec, b: Dec): Dec => a - b;
export const mul = (a: Dec, b: Dec): Dec => divRound(a * b, SCALE);
export const div = (a: Dec, b: Dec): Dec => {
  if (b === 0n) throw new Error('División entre cero');
  return divRound(a * SCALE, b);
};
export const neg = (a: Dec): Dec => -a;
export const abs = (a: Dec): Dec => (a < 0n ? -a : a);
export const isZero = (a: Dec): boolean => a === 0n;
export const cmp = (a: Dec, b: Dec): number => (a === b ? 0 : a < b ? -1 : 1);
export const max = (a: Dec, b: Dec): Dec => (a > b ? a : b);

/** Redondea a `places` decimales (mitad hacia arriba). */
export function round(a: Dec, places = 2): Dec {
  const step = 10n ** BigInt(PLACES - places);
  return divRound(a, step) * step;
}

/** Texto con exactamente `places` decimales: "600.00". */
export function fmt(a: Dec, places = 2): string {
  const r = round(a, places);
  const negative = r < 0n;
  const v = negative ? -r : r;
  const int = v / SCALE;
  const frac = (v % SCALE).toString().padStart(PLACES, '0').slice(0, places);
  return `${negative ? '-' : ''}${int}${places > 0 ? `.${frac}` : ''}`;
}

/** Texto sin ceros de más, con al menos `min` y a lo sumo `maxPlaces` decimales. */
export function fmtTrim(a: Dec, maxPlaces = 10, min = 0): string {
  const s = fmt(a, maxPlaces);
  if (!s.includes('.')) return s;
  let [int, frac] = s.split('.') as [string, string];
  frac = frac.replace(/0+$/, '');
  if (frac.length < min) frac = frac.padEnd(min, '0');
  return frac ? `${int}.${frac}` : int;
}

export const toNumber = (a: Dec): number => Number(fmt(a, PLACES));
