import { promises as fs } from 'node:fs';
import path from 'node:path';

/** De dónde se leen los archivos del padrón: una carpeta local o un bucket de Cloud Storage. */
export interface BlobSource {
  /** Lee un archivo completo, o solo el rango de bytes [start, end]. */
  read(name: string, range?: { start: number; end: number }): Promise<Buffer>;
}

export class FileBlobSource implements BlobSource {
  constructor(private readonly dir: string) {}

  async read(name: string, range?: { start: number; end: number }): Promise<Buffer> {
    const file = path.join(this.dir, name);
    if (!range) return fs.readFile(file);
    const handle = await fs.open(file, 'r');
    try {
      const length = range.end - range.start + 1;
      const { buffer } = await handle.read(Buffer.allocUnsafe(length), 0, length, range.start);
      return buffer;
    } finally {
      await handle.close();
    }
  }
}

const METADATA_TOKEN = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

/**
 * Cloud Storage por su API JSON, con el token de la cuenta de servicio de
 * Cloud Run (servidor de metadatos). Sin SDK: solo hacen falta lecturas por rango.
 */
export class GcsBlobSource implements BlobSource {
  private token?: { value: string; expiresAt: number };

  constructor(
    private readonly bucket: string,
    private readonly prefix: string,
    private readonly timeoutMs = 15_000,
    /** Token fijo (desarrollo local): `gcloud auth print-access-token`. */
    private readonly staticToken?: string,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.staticToken) return this.staticToken;
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await fetch(METADATA_TOKEN, { headers: { 'metadata-flavor': 'Google' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`El servidor de metadatos respondió HTTP ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  async read(name: string, range?: { start: number; end: number }): Promise<Buffer> {
    const object = encodeURIComponent(this.prefix ? `${this.prefix}/${name}` : name);
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${this.bucket}/o/${object}?alt=media`, {
      headers: { authorization: `Bearer ${await this.accessToken()}`, ...(range ? { range: `bytes=${range.start}-${range.end}` } : {}) },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status === 401) this.token = undefined;
    if (!res.ok) throw new Error(`Cloud Storage respondió HTTP ${res.status} al leer ${name}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** `gs://bucket/prefijo` o una ruta local (también `file:///ruta`). */
export function blobSourceFrom(url: string, opts: { timeoutMs?: number; token?: string } = {}): BlobSource {
  const gs = /^gs:\/\/([^/]+)\/?(.*)$/.exec(url);
  if (gs) return new GcsBlobSource(gs[1], gs[2].replace(/\/+$/, ''), opts.timeoutMs, opts.token);
  return new FileBlobSource(url.replace(/^file:\/\//, ''));
}
