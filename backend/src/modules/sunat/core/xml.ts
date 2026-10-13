/** Utilidades mínimas para armar XML a mano (los UBL son plantillas fijas). */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** Caracteres de control que XML 1.0 no admite. */
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/** Escapa texto para contenido o atributos. */
export function esc(value: string | number): string {
  return String(value)
    .replace(INVALID_XML_CHARS, '')
    .replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** `<tag attrs>texto</tag>`; sin valor no escribe nada (campos opcionales). */
export function el(tag: string, value: string | number | null | undefined, attrs?: Record<string, string | undefined>): string {
  if (value === null || value === undefined || value === '') return '';
  return `<${tag}${attributes(attrs)}>${esc(value)}</${tag}>`;
}

/** `<tag>…hijos…</tag>`; si no queda ningún hijo, no escribe nada. */
export function group(tag: string, children: Array<string | false | null | undefined>, attrs?: Record<string, string | undefined>): string {
  const body = children.filter(Boolean).join('');
  return body ? `<${tag}${attributes(attrs)}>${body}</${tag}>` : '';
}

function attributes(attrs?: Record<string, string | undefined>): string {
  if (!attrs) return '';
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${esc(v!)}"`)
    .join('');
}

/** Texto de un solo renglón: SUNAT rechaza saltos de línea y espacios dobles en varios campos. */
export function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
