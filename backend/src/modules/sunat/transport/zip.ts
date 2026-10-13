import { strFromU8, unzipSync, zipSync } from 'fflate';

/** ZIP con un solo archivo, como lo pide SUNAT (el XML firmado con su nombre). */
export function zipFile(name: string, content: string | Uint8Array): Uint8Array<ArrayBuffer> {
  const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  return bytes(zipSync({ [name]: [data, { level: 9 }] }));
}

/** Copia respaldada por un ArrayBuffer propio (lo que Prisma acepta en columnas Bytes). */
export function bytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(data);
}

/** Primer XML dentro de un ZIP (el CDR viene con una carpeta `dummy/` de relleno). */
export function unzipXml(zip: Uint8Array): { name: string; xml: string } | null {
  const files = unzipSync(zip, { filter: (f) => f.name.toLowerCase().endsWith('.xml') });
  const name = Object.keys(files)[0];
  return name ? { name, xml: strFromU8(files[name]) } : null;
}
