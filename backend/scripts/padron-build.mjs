// Convierte el padrón reducido del RUC de SUNAT (padron_reducido_ruc.txt, ~1,6 GB,
// ~20 millones de filas sin ordenar) en un índice compacto para consultar un RUC
// con UNA lectura por rango, sin base de datos:
//
//   data.bin       bloques gzip concatenados; cada bloque trae N filas ordenadas por RUC
//                  ("ruc|nombre|estado|condicion|ubigeo|direccion\n", en UTF-8)
//   index.bin      por bloque: primer RUC (float64 LE), offset (float64 LE), largo (uint32 LE)
//   manifest.json  versión, totales y nombres de los archivos
//
//   node scripts/padron-build.mjs <padron_reducido_ruc.txt> <carpeta de salida> [--version AAAA-MM-DD]
//
// Lo corre a diario .github/workflows/padron-ruc.yml y sube el resultado a Cloud
// Storage; la API lo lee con src/modules/sunat/consultas/padron.reader.ts.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BLOCK_ROWS = 512;
const INDEX_ENTRY = 20;

const [input, outDir] = process.argv.slice(2);
if (!input || !outDir) {
  console.error('Uso: node scripts/padron-build.mjs <padron_reducido_ruc.txt> <carpeta de salida> [--version AAAA-MM-DD]');
  process.exit(1);
}
const versionArg = process.argv.indexOf('--version');
const version = versionArg > -1 ? process.argv[versionArg + 1] : new Date().toISOString().slice(0, 10);

const t0 = Date.now();
const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

// 1. Todo el archivo a memoria (fuera del heap de V8), leyendo por partes.
const size = fs.statSync(input).size;
const buf = Buffer.allocUnsafe(size);
{
  const fd = fs.openSync(input, 'r');
  let read = 0;
  while (read < size) read += fs.readSync(fd, buf, read, Math.min(64 << 20, size - read), read);
  fs.closeSync(fd);
}
log(`Leídos ${(size / 1e6).toFixed(0)} MB`);

// 2. Inicio de cada fila y su RUC como número (11 dígitos caben exactos en un double).
let capacity = 24_000_000;
let starts = new Float64Array(capacity);
let keys = new Float64Array(capacity);
let rows = 0;
let skipped = 0;
for (let pos = 0; pos < size; ) {
  let end = buf.indexOf(0x0a, pos);
  if (end === -1) end = size;
  let key = 0;
  let valid = end - pos > 12 && buf[pos + 11] === 0x7c; // '|' después del RUC
  for (let i = 0; valid && i < 11; i++) {
    const digit = buf[pos + i] - 48;
    if (digit < 0 || digit > 9) valid = false;
    else key = key * 10 + digit;
  }
  if (valid) {
    if (rows === capacity) {
      capacity *= 2;
      const s = new Float64Array(capacity);
      s.set(starts);
      starts = s;
      const k = new Float64Array(capacity);
      k.set(keys);
      keys = k;
    }
    starts[rows] = pos;
    keys[rows] = key;
    rows++;
  } else if (end > pos) {
    skipped++; // la cabecera y alguna fila rota
  }
  pos = end + 1;
}
log(`${rows.toLocaleString('es')} filas (${skipped} descartadas)`);
if (rows < 1_000_000) {
  console.error('El padrón trae muy pocas filas: no parece el archivo completo. No se genera nada.');
  process.exit(1);
}

// 3. Orden por RUC.
const order = new Uint32Array(rows);
for (let i = 0; i < rows; i++) order[i] = i;
order.sort((a, b) => keys[a] - keys[b]);
log('Ordenado');

// 4. Bloques.
const EMPTY = new Set(['', '-', '--', '---', '----', '-----']);
const clean = (v) => {
  const t = (v ?? '').trim().replace(/\s+/g, ' ');
  return EMPTY.has(t) ? '' : t;
};

/** Dirección como la imprime SUNAT: vía, número, interior, manzana, lote, zona… */
function address(f) {
  const [via, nombreVia, codZona, tipoZona, numero, interior, lote, dpto, manzana, km] = f.slice(5, 15).map(clean);
  const parts = [];
  if (via || nombreVia) parts.push(`${via} ${nombreVia}`.trim());
  if (numero) parts.push(`NRO. ${numero}`);
  if (interior) parts.push(`INT. ${interior}`);
  if (dpto) parts.push(`DPTO. ${dpto}`);
  if (manzana) parts.push(`MZA. ${manzana}`);
  if (lote) parts.push(`LOTE. ${lote}`);
  if (km) parts.push(`KM. ${km}`);
  if (codZona || tipoZona) parts.push(`${codZona} ${tipoZona}`.trim());
  return parts.join(' ');
}

fs.mkdirSync(outDir, { recursive: true });
const dataPath = path.join(outDir, 'data.bin');
const dataFd = fs.openSync(dataPath, 'w');
const blocks = Math.ceil(rows / BLOCK_ROWS);
const index = Buffer.alloc(blocks * INDEX_ENTRY);
let offset = 0;
let written = 0;
let block = 0;
let lines = [];
let firstKey = 0;
let lastKey = -1;

function flush() {
  if (!lines.length) return;
  const gz = zlib.gzipSync(Buffer.from(lines.join(''), 'utf8'), { level: 9 });
  fs.writeSync(dataFd, gz);
  index.writeDoubleLE(firstKey, block * INDEX_ENTRY);
  index.writeDoubleLE(offset, block * INDEX_ENTRY + 8);
  index.writeUInt32LE(gz.length, block * INDEX_ENTRY + 16);
  offset += gz.length;
  block++;
  lines = [];
}

for (let i = 0; i < rows; i++) {
  const row = order[i];
  const key = keys[row];
  if (key === lastKey) continue; // RUC repetido: queda la primera fila
  lastKey = key;
  const start = starts[row];
  let end = buf.indexOf(0x0a, start);
  if (end === -1) end = size;
  // El padrón viene en ISO-8859-1.
  const f = buf.latin1Slice(start, end).replace(/\r$/, '').split('|');
  const ubigeo = clean(f[4]);
  const line = [f[0], clean(f[1]), clean(f[2]), clean(f[3]), /^\d{6}$/.test(ubigeo) ? ubigeo : '', address(f)].join('|');
  if (!lines.length) firstKey = key;
  lines.push(`${line}\n`);
  written++;
  if (lines.length === BLOCK_ROWS) flush();
}
flush();
fs.closeSync(dataFd);
fs.writeFileSync(path.join(outDir, 'index.bin'), index.subarray(0, block * INDEX_ENTRY));
fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  `${JSON.stringify({ version, records: written, blocks: block, blockRows: BLOCK_ROWS, dataBytes: offset, data: 'data.bin', index: 'index.bin', builtAt: new Date().toISOString() }, null, 2)}\n`,
);
log(`${written.toLocaleString('es')} RUC en ${block.toLocaleString('es')} bloques: data.bin ${(offset / 1e6).toFixed(0)} MB, index.bin ${((block * INDEX_ENTRY) / 1e3).toFixed(0)} KB`);
