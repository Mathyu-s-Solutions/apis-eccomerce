// Genera src/data/sunat-catalogs.json (las páginas /catalogos del sitio de SUNAT) a partir de
// los catálogos que usa la API: backend/src/modules/sunat/core/catalogs.ts. Así las páginas
// muestran exactamente los códigos que la API acepta.
//
//   node scripts/snapshot-sunat-catalogs.mjs
//
// Node 24 importa el .ts directamente (quita los tipos al cargarlo).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, '..', '..', 'backend', 'src', 'modules', 'sunat', 'core', 'catalogs.ts');
const out = path.join(here, '..', 'src', 'data', 'sunat-catalogs.json');

const c = await import(pathToFileURL(source).href);
const list = (table) => Object.entries(table).map(([code, description]) => ({ code, description }));

const data = {
  documents: Object.entries(c.DOCUMENT_CODES).map(([api, code]) => ({ code, description: c.DOCUMENT_NAMES[code], api })),
  identityTypes: list(c.IDENTITY_TYPES),
  units: list(c.UNITS),
  affectations: Object.entries(c.AFFECTATIONS).map(([code, a]) => ({
    code,
    description: a.description,
    scheme: `${a.scheme.id} ${a.scheme.name}`,
    free: a.free,
  })),
  creditNoteTypes: list(c.CREDIT_NOTE_TYPES),
  debitNoteTypes: list(c.DEBIT_NOTE_TYPES),
  operationTypes: list(c.OPERATION_TYPES),
  allowances: Object.entries(c.ALLOWANCE_CODES).map(([code, a]) => ({ code, description: a.description, level: a.level, affectsBase: a.affectsBase })),
  paymentMeans: list(c.PAYMENT_MEANS),
  detractions: Object.entries(c.DETRACTIONS).map(([code, d]) => ({ code, description: d.description, percent: d.percent, minimum: d.minimum })),
  transferReasons: list(c.TRANSFER_REASONS),
  transportModes: list(c.TRANSPORT_MODES),
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Catálogos → ${path.relative(process.cwd(), out)}`);
for (const [k, v] of Object.entries(data)) console.log(`  ${k}: ${v.length}`);
