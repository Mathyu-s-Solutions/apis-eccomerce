import { XMLParser } from 'fast-xml-parser';
import { unzipXml } from './zip';

/** Constancia de Recepción (CDR) de SUNAT ya interpretada. */
export interface Cdr {
  /** "0" = aceptado; 2000-3999 = rechazado. */
  code: string;
  description: string;
  /** Observaciones (códigos 4000+): el comprobante es válido pero SUNAT advierte algo. */
  notes: string[];
  accepted: boolean;
  /** XML del CDR. */
  xml: string;
}

const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false });

const list = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** SUNAT escapa dos veces las tildes de sus mensajes ("operaci&#243;n"). */
const clean = (v: unknown): string =>
  String(v ?? '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

export function parseCdrXml(xml: string): Cdr {
  const root = parser.parse(xml)?.ApplicationResponse;
  const response = list(root?.DocumentResponse)[0]?.Response;
  if (!response) throw new Error('El CDR de SUNAT no trae DocumentResponse');
  const code = String(response.ResponseCode ?? '').trim();
  return {
    code,
    description: clean(response.Description),
    notes: list<unknown>(root.Note).map(clean).filter(Boolean),
    accepted: Number(code) === 0,
    xml,
  };
}

/** El CDR llega como ZIP (base64 en SOAP). */
export function parseCdrZip(zip: Uint8Array): Cdr {
  const file = unzipXml(zip);
  if (!file) throw new Error('El ZIP del CDR no trae ningún XML');
  return parseCdrXml(file.xml);
}
