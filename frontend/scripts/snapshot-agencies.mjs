// Genera public/data/agencies-{shalom,olva}.json para el mapa de la landing.
//
// Desde la API (local o prod):
//   API_URL=http://localhost:3000 API_KEY=dev-... node scripts/snapshot-agencies.mjs
// Desde respuestas ya guardadas de GET /v1/{marca}/agencies?raw=1:
//   node scripts/snapshot-agencies.mjs shalom.json olva.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const BRANDS = ['shalom', 'olva'];

async function load(brand, file) {
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const { API_URL, API_KEY } = process.env;
  if (!API_URL || !API_KEY) throw new Error('Define API_URL y API_KEY, o pasa los archivos JSON como argumentos.');
  // raw=1: el teléfono de Shalom y el tipo de oficina de Olva solo vienen en la respuesta cruda.
  const res = await fetch(`${API_URL}/v1/${brand}/agencies?raw=1`, { headers: { 'x-api-key': API_KEY } });
  if (!res.ok) throw new Error(`${brand}: HTTP ${res.status}`);
  return res.json();
}

const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'el', 'en', 'a', 'al']);
function title(s = '') {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/^(\p{L})/u, (c) => c.toUpperCase())))
    .join(' ')
    .replace(/\bS\/n\b/gi, 's/n');
}

const hhmm = (t) => (t ? t.slice(0, 5) : null);

function shalomHours(raw) {
  if (!raw.horario_atencion_lunes_inicio) return '';
  const week = `Lun–sáb ${hhmm(raw.horario_atencion_lunes_inicio)}–${hhmm(raw.horario_atencion_lunes_fin)}`;
  const sun = raw.horario_atencion_domingo_inicio
    ? ` · dom ${hhmm(raw.horario_atencion_domingo_inicio)}–${hhmm(raw.horario_atencion_domingo_fin)}`
    : ' · dom cerrado';
  return week + sun;
}

function olvaHours(raw) {
  const h = raw.horario ?? {};
  if (!h.monday?.open) return '';
  const sat = h.saturday?.open ? ` · sáb ${h.saturday.open}–${h.saturday.close}` : ' · sáb cerrado';
  const sun = h.sunday?.open ? ` · dom ${h.sunday.open}–${h.sunday.close}` : '';
  return `Lun–vie ${h.monday.open}–${h.monday.close}${sat}${sun}`;
}

function compact(brand, a) {
  const raw = a.raw ?? {};
  const shalom = brand === 'shalom';
  return {
    id: a.code,
    n: title(shalom ? a.name.split(' / ').pop() : a.name.split(' - ')[0]),
    d: a.department ?? '',
    pv: title(a.province ?? ''),
    a: title(a.address ?? '').slice(0, 140),
    h: shalom ? shalomHours(raw) : olvaHours(raw),
    t: shalom ? raw.telefono ?? '' : title(raw.tipo ?? ''),
    lat: Math.round(a.latitude * 1e5) / 1e5,
    lng: Math.round(a.longitude * 1e5) / 1e5,
  };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const files = process.argv.slice(2);
for (const [i, brand] of BRANDS.entries()) {
  const list = await load(brand, files[i]);
  const agencies = list.filter((a) => a.latitude && a.longitude).map((a) => compact(brand, a));
  const out = path.join(OUT_DIR, `agencies-${brand}.json`);
  fs.writeFileSync(out, JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), total: list.length, agencies }));
  console.log(`${brand}: ${agencies.length} de ${list.length} agencias con coordenadas → ${path.relative(process.cwd(), out)}`);
}
