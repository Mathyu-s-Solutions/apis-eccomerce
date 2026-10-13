import { gunzipSync } from 'node:zlib';
import type { BlobSource } from './blob-source';

/** Fila del padrón reducido del RUC. */
export interface PadronRecord {
  ruc: string;
  nombre: string;
  estado: string;
  condicion: string;
  ubigeo: string | null;
  direccion: string | null;
}

interface Manifest {
  version: string;
  records: number;
  blocks: number;
  data: string;
  index: string;
}

interface Loaded {
  manifest: Manifest;
  /** Carpeta de la versión dentro de la fuente ("" si está en la raíz). */
  dir: string;
  firstRuc: Float64Array;
  offset: Float64Array;
  length: Uint32Array;
  loadedAt: number;
}

const INDEX_ENTRY = 20;
const RELOAD_MS = 60 * 60_000;
const CACHED_BLOCKS = 256;

/**
 * Lee el índice que genera scripts/padron-build.mjs: el directorio de bloques
 * vive en memoria (~700 KB) y cada consulta trae un solo bloque (~10 KB).
 *
 * En la raíz de la fuente va `current.json` ({ "path": "2026-10-12" }), que
 * apunta a la carpeta de la versión vigente; así se publica un padrón nuevo
 * sin que nadie lea archivos a medio subir.
 */
export class PadronReader {
  private loaded?: Loaded;
  private loading?: Promise<Loaded>;
  private readonly blocks = new Map<number, string>();

  constructor(private readonly source: BlobSource) {}

  private async load(): Promise<Loaded> {
    let dir = '';
    try {
      dir = String((JSON.parse((await this.source.read('current.json')).toString('utf8')) as { path?: string }).path ?? '');
    } catch {
      dir = ''; // sin puntero: los archivos están en la raíz
    }
    if (this.loaded && this.loaded.dir === dir && dir) {
      this.loaded.loadedAt = Date.now();
      return this.loaded;
    }
    const at = (name: string) => (dir ? `${dir}/${name}` : name);
    const manifest = JSON.parse((await this.source.read(at('manifest.json'))).toString('utf8')) as Manifest;
    const index = await this.source.read(at(manifest.index));
    const n = Math.floor(index.length / INDEX_ENTRY);
    const loaded: Loaded = { manifest, dir, firstRuc: new Float64Array(n), offset: new Float64Array(n), length: new Uint32Array(n), loadedAt: Date.now() };
    for (let i = 0; i < n; i++) {
      loaded.firstRuc[i] = index.readDoubleLE(i * INDEX_ENTRY);
      loaded.offset[i] = index.readDoubleLE(i * INDEX_ENTRY + 8);
      loaded.length[i] = index.readUInt32LE(i * INDEX_ENTRY + 16);
    }
    this.blocks.clear();
    this.loaded = loaded;
    return loaded;
  }

  private async ready(): Promise<Loaded> {
    if (this.loaded && Date.now() - this.loaded.loadedAt < RELOAD_MS) return this.loaded;
    this.loading ??= this.load().finally(() => {
      this.loading = undefined;
    });
    try {
      return await this.loading;
    } catch (e) {
      // Si falla la recarga, se sigue con el índice que ya había.
      if (this.loaded) return this.loaded;
      throw e;
    }
  }

  async info(): Promise<{ version: string; records: number }> {
    const { manifest } = await this.ready();
    return { version: manifest.version, records: manifest.records };
  }

  async find(ruc: string): Promise<PadronRecord | null> {
    const idx = await this.ready();
    const key = Number(ruc);
    // Último bloque cuyo primer RUC es <= el buscado.
    let lo = 0;
    let hi = idx.firstRuc.length - 1;
    let block = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (idx.firstRuc[mid] <= key) {
        block = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (block < 0) return null;

    let text = this.blocks.get(block);
    if (text === undefined) {
      const start = idx.offset[block];
      const data = await this.source.read(idx.dir ? `${idx.dir}/${idx.manifest.data}` : idx.manifest.data, { start, end: start + idx.length[block] - 1 });
      text = gunzipSync(data).toString('utf8');
      if (this.blocks.size >= CACHED_BLOCKS) this.blocks.delete(this.blocks.keys().next().value as number);
      this.blocks.set(block, text);
    }
    const needle = `${ruc}|`;
    const at = text.startsWith(needle) ? 0 : text.indexOf(`\n${needle}`) + 1;
    if (at === 0 && !text.startsWith(needle)) return null;
    const end = text.indexOf('\n', at);
    const [, nombre, estado, condicion, ubigeo, direccion] = text.slice(at, end === -1 ? undefined : end).split('|');
    return { ruc, nombre, estado, condicion, ubigeo: ubigeo || null, direccion: direccion || null };
  }
}
