// Motor de contenido SEO: escribe la próxima guía del backlog con Claude, la revisa sola y la
// deja en content/guias/<slug>.md. El workflow .github/workflows/seo-guides.yml la publica
// directo en main si pasa la revisión, o abre un PR si no.
//
// La revisión reemplaza a la de una persona, así que es estricta:
//   1. Chequeos fijos: links solo a páginas que existen, endpoints que existen en la API,
//      sin H1, largo, título y descripción.
//   2. Un segundo pedido a Claude, como revisor, compara cada afirmación con los datos del
//      producto y busca cifras o normas inventadas, código que no funcionaría y afiliaciones.
//   3. Si hay problemas, el autor corrige y se vuelve a revisar (hasta 2 veces). Si siguen,
//      publish=false y el workflow abre un PR en vez de publicar.
//
//   ANTHROPIC_API_KEY=... node scripts/seo/write-guide.mjs              # el siguiente tema pendiente
//   ANTHROPIC_API_KEY=... node scripts/seo/write-guide.mjs --slug X     # un tema concreto del backlog
//   ... --dry-run                                                       # muestra el resultado sin escribir
//   node scripts/seo/write-guide.mjs --slug X --print-prompt            # solo muestra el pedido (sin llamar a la API)
//   node scripts/seo/write-guide.mjs --check content/guias/X.md         # chequeos fijos de una guía (sin la API)
//
// Cuando quedan pocos temas pendientes, le pide a Claude ideas nuevas y las agrega al backlog.
//
// Variables: ANTHROPIC_API_KEY (obligatoria), NEXT_PUBLIC_API_URL (URL pública de la API para
// los ejemplos; sin ella los ejemplos usan $MATHYU_API_URL), GITHUB_OUTPUT y NOTES_FILE (en CI).
// Salidas para el workflow: slug, title, publish ("true" | "false").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GUIDES_DIR = path.join(ROOT, 'content', 'guias');
const BACKLOG_FILE = path.join(ROOT, 'content', 'seo', 'backlog.json');
const MODEL = 'claude-opus-5-5';
/** Con menos temas pendientes que esto, se piden ideas nuevas. */
const MIN_PENDING = 5;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = flag('dry-run');

// Los datos del producto salen del mismo código que usa el sitio (Node 24 importa .ts).
process.env.NEXT_PUBLIC_API_URL ||= '$MATHYU_API_URL';
const API_URL = process.env.NEXT_PUBLIC_API_URL;
const { BRANDS, HUB } = await import(pathToFileURL(path.join(ROOT, 'src', 'lib', 'brands.ts')).href);
const { PLANS, BUNDLES, fairUse } = await import(pathToFileURL(path.join(ROOT, 'src', 'lib', 'plans.ts')).href);
const { DEPARTMENT_LABEL } = await import(pathToFileURL(path.join(ROOT, 'src', 'lib', 'peru-map.ts')).href);
const catalogSlugs = [...fs.readFileSync(path.join(ROOT, 'src', 'lib', 'sunat-catalogs.ts'), 'utf8').matchAll(/slug: '([^']+)'/g)].map((m) => m[1]);

/** Igual que slugify de src/lib/directory.ts. */
function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Backlog y guías existentes

/** @typedef {{ slug: string; site: 'hub'|'shalom'|'olva'|'sunat'; keyword: string; angle: string; skip?: boolean }} Topic */

/** @returns {Topic[]} */
function readBacklog() {
  return JSON.parse(fs.readFileSync(BACKLOG_FILE, 'utf8'));
}

function existingGuides() {
  if (!fs.existsSync(GUIDES_DIR)) return [];
  return fs
    .readdirSync(GUIDES_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const head = fs.readFileSync(path.join(GUIDES_DIR, f), 'utf8').split('---')[1] ?? '';
      const get = (k) => {
        const m = new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(head);
        try {
          return m ? JSON.parse(m[1]) : '';
        } catch {
          return m?.[1] ?? '';
        }
      };
      return { slug: f.replace(/\.md$/, ''), site: get('site'), title: get('title') };
    });
}

const done = (topic) => fs.existsSync(path.join(GUIDES_DIR, `${topic.slug}.md`));

// ---------------------------------------------------------------------------
// Datos del producto (lo único que el artículo puede afirmar sobre nosotros)

function sitePages(siteId) {
  const common = ['/ (inicio)', '/docs (documentación)', '/pricing (precios)'];
  if (siteId === 'shalom' || siteId === 'olva') {
    return [...common, '/agencias (directorio de agencias por departamento)', '/agencias/<departamento> (ej. /agencias/arequipa, /agencias/la-libertad)'];
  }
  if (siteId === 'sunat') {
    return [...common, '/tipo-de-cambio (tipo de cambio SBS de hoy)', '/catalogos (catálogos de SUNAT)', ...catalogSlugs.map((s) => `/catalogos/${s}`)];
  }
  return [...common, '/register (crear cuenta)'];
}

/**
 * Campos del JSON de SUNAT API (backend/src/modules/sunat/dto/document.dto.ts y despatch.dto.ts).
 * Si cambian los DTO, actualizar aquí: es lo que evita que una guía invente campos.
 */
const SUNAT_FIELDS = `Campos del JSON de POST /v1/sunat/documents (mismo formato que apisunat.pe):
- documento: "factura" | "boleta" | "nota_credito" | "nota_debito"; serie: 4 caracteres, empieza con F (factura) o B (boleta); numero: opcional (sin él toma el siguiente correlativo).
- fecha_de_emision (AAAA-MM-DD), hora_de_emision, fecha_de_vencimiento, moneda: "PEN" | "USD" | "EUR" (por defecto PEN), tipo_operacion: catálogo 51 (por defecto "0101").
- cliente_tipo_de_documento (catálogo 06: "1" DNI, "6" RUC…), cliente_numero_de_documento, cliente_denominacion, cliente_direccion, cliente_email. Una factura va a un cliente con RUC ("6") salvo exportación.
- items[]: descripcion, cantidad, unidad_de_medida (por defecto "NIU"), valor_unitario (sin IGV) o precio_unitario (con IGV, el de la etiqueta: el total del ítem sale exacto y el IGV por diferencia; si vienen los dos manda valor_unitario), porcentaje_igv (por defecto 18), codigo_tipo_afectacion_igv (catálogo 07, por defecto "10"), codigo_interno, codigo_producto_sunat (8 dígitos), descuentos[] por ítem con codigo "00" (afecta la base) o "01" (no la afecta) y monto.
- descuentos[] globales: codigo "02", "03" o "62" (retención) y monto. cuotas[]: importe y fecha_de_pago (venta al crédito). anticipos[]: documento, serie, numero, monto.
- detraccion: detraccion_tipo (catálogo 54), detraccion_porcentaje, detraccion_total, medio_de_pago (catálogo 59, por defecto "001"), numero_cuenta_banco_nacion; exige tipo_operacion "1001" (o 1002 a 1004).
- Notas: nota_credito_codigo_tipo (catálogo 09) o nota_debito_codigo_tipo (catálogo 10), nota_credito_motivo / nota_debito_motivo, documento_afectado: { documento: "factura" | "boleta", serie, numero }.
- enviar_en_resumen: true en boletas para no enviarlas en el momento e informarlas después en un resumen diario.
- total: opcional; si viene se compara con el total calculado (tolerancia de un céntimo).
- Cabecera x-ruc para elegir la empresa emisora cuando la cuenta tiene más de una. Cabecera Idempotency-Key para reintentar sin duplicar.
Guías de remisión (POST /v1/sunat/dispatches): documento "guia_remision_remitente" (serie empieza con T) o "guia_remision_transportista"; motivo_de_traslado (catálogo 20), motivo_de_traslado_descripcion, modalidad_de_transporte ("01" público, "02" privado), destinatario_tipo_de_documento y destinatario_numero_de_documento, punto_de_partida_ubigeo / punto_de_partida_direccion, punto_de_llegada_ubigeo / punto_de_llegada_direccion, peso_bruto_total, peso_bruto_unidad_de_medida ("KGM" o "TNE"), numero_de_bultos, conductores[] y vehiculos[] (transporte privado), items[] con descripcion, cantidad y unidad_de_medida.`;

function brandFacts(brand) {
  const lines = [
    `Producto: ${brand.name} (${brand.tagline}).`,
    `Dominio: https://${brand.hosts[0]}`,
    `Qué es: ${brand.heroSubtitle}`,
    `Independencia: es un servicio de Mathyu's Solutions, NO afiliado a ${brand.owner}.`,
    `Autenticación: header x-api-key con la API key que el cliente crea en su panel. URL base de la API: ${API_URL}${brand.apiPrefix}`,
    '',
    'Funciones:',
    ...brand.features.map((f) => `- ${f.title}: ${f.description}`),
    '',
    'Endpoints (ruta, qué hace, costo en la cuota):',
  ];
  for (const s of brand.docs) {
    lines.push(`## ${s.title}: ${s.description}`);
    for (const e of s.endpoints) lines.push(`- ${e.method} ${e.absolute ? e.path : `${brand.apiPrefix}${e.path}`} — ${e.summary}${e.cost ? ` (${e.cost})` : ''}`);
  }
  if (brand.id === 'sunat') lines.push('', SUNAT_FIELDS);
  lines.push('', 'Ejemplos oficiales de la documentación:');
  for (const q of brand.quickstart) lines.push(`### ${q.label}`, '```', q.code, '```');
  lines.push('', 'Planes (precio mensual en soles):');
  for (const p of PLANS[brand.id]) {
    lines.push(`- ${p.name}: ${p.pricedPen ? `S/ ${p.pricedPen} al mes` : 'gratis'}; ${p.monthlyLimit === null ? 'sin cuota mensual' : `${p.monthlyLimit} al mes`}. ${p.features.join('; ')}.`);
  }
  if (brand.id !== 'sunat') lines.push(`- Uso razonable de los planes ilimitados: ${fairUse(brand.id)}`);
  for (const b of BUNDLES.filter((b) => b.items.some((i) => i.product === brand.id))) lines.push(`- Pack: ${b.name} (${b.description}) a S/ ${b.pricedPen} al mes.`);
  lines.push('', 'Cuenta: registro con Google o correo; una cuenta sirve para todas las APIs (Shalom, Olva, SUNAT). Pagos con Yape o Plin.');
  return lines.join('\n');
}

function hubFacts() {
  return [
    `Sitio: ${HUB.name} (https://${HUB.hosts[0]}): ${HUB.heroSubtitle}`,
    "Mathyu's Solutions ofrece APIs independientes: no está afiliado a Shalom, Olva Courier ni a la SUNAT.",
    '',
    ...Object.values(BRANDS).map((b) => `# ${b.name} (https://${b.hosts[0]})\n${brandFacts(b)}`),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Claude

const client = new Anthropic();

const SYSTEM = `Escribes guías para el blog técnico de Mathyu's APIs, un proveedor peruano de APIs para ecommerce (Shalom, Olva Courier y SUNAT).

Lectores: desarrolladores y dueños de tiendas online en Perú que buscan resolver algo concreto en Google. La guía tiene que resolverles eso mejor que cualquier otro resultado, y de paso mostrar cómo hacerlo con nuestra API.

Cómo escribir:
- Español de Perú, tuteando, directo y concreto. Sin relleno, sin frases de marketing vacías, sin emojis.
- Las primeras dos o tres oraciones responden la búsqueda. Después, el detalle.
- Secciones con ## y ### (sin # de primer nivel: el título va aparte). Pasos numerados cuando haya un procedimiento. Tablas cuando comparen opciones.
- Ejemplos de código completos con curl o JavaScript (fetch), o PHP si la guía es sobre WooCommerce, usando solo los endpoints y campos de los datos del producto, la URL base tal como aparece y la key en la variable $MATHYU_API_KEY.
- Termina con una sección "## Preguntas frecuentes" de 3 a 5 preguntas reales (cada una con ###) y respuestas cortas.
- Entre 1200 y 1800 palabras.

Exactitud (lo más importante):
- Todo lo que digas de nuestro producto (endpoints, campos, precios, límites, planes) tiene que estar en los datos del producto. Si no está ahí, no lo digas.
- Sobre SUNAT, Shalom u Olva, afirma solo cosas generales y bien establecidas. No inventes cifras, tarifas, plazos, multas, números de resolución ni fechas. Si un dato es importante y no estás seguro, di que se verifique en la fuente oficial, sin inventarlo.
- No digas ni des a entender que somos Shalom, Olva o la SUNAT, ni que tenemos un convenio con ellos.
- Enlaza solo a las páginas de la lista "Páginas del sitio" (con su ruta relativa, por ejemplo [documentación](/docs)) y, si hace falta, a sitios oficiales (sunat.gob.pe, shalom.com.pe, olvacourier.com).

En review_notes anota para quien revisa: cada afirmación que convenga verificar antes de publicar y cualquier supuesto que hiciste.`;

const GuideSchema = z.object({
  title: z.string().describe('Título SEO en español, de 45 a 65 caracteres, con la keyword principal al inicio'),
  description: z.string().describe('Meta descripción de 130 a 160 caracteres, con la keyword y un beneficio concreto'),
  keywords: z.array(z.string()).describe('De 3 a 6 búsquedas relacionadas'),
  body_markdown: z.string().describe('Cuerpo de la guía en Markdown, sin el título'),
  review_notes: z.array(z.string()).describe('Qué verificar antes de publicar'),
});

const ReviewSchema = z.object({
  approved: z.boolean().describe('true solo si no queda ningún problema'),
  issues: z.array(z.string()).describe('Cada problema: dónde está, qué está mal y cómo corregirlo'),
});

const IdeasSchema = z.object({
  topics: z.array(
    z.object({
      slug: z.string().describe('kebab-case, sin tildes, de 3 a 7 palabras'),
      site: z.enum(['hub', 'shalom', 'olva', 'sunat']),
      keyword: z.string().describe('La búsqueda en Google que ataca, tal como la escribiría alguien en Perú'),
      angle: z.string().describe('Qué resuelve la guía y cómo encaja la API, en una o dos oraciones'),
    }),
  ),
});

const REVIEWER = `Eres el editor que decide si una guía del blog técnico de Mathyu's APIs se publica. Nadie más la va a revisar: si apruebas algo falso, sale publicado.

Marca como problema (y solo eso; el estilo no es motivo para rechazar):
- Cualquier afirmación sobre nuestro producto (endpoints, campos del JSON, precios, límites, planes, funciones) que no esté respaldada por los datos del producto.
- Cifras, tarifas, plazos, multas, números de resolución, fechas u otros datos concretos sobre SUNAT, Shalom u Olva que no sean de conocimiento general y bien establecido.
- Código que no funcionaría: endpoints o campos que no existen, JSON inválido, método HTTP equivocado, la key fuera de $MATHYU_API_KEY.
- Que diga o dé a entender que somos Shalom, Olva o la SUNAT, o que tenemos un convenio con ellos.
- Que no responda la búsqueda objetivo, o que tenga secciones de relleno que no aportan.

Para cada problema di dónde está y cómo corregirlo. Aprueba solo si no queda ninguno.`;

/** Una llamada con salida JSON validada. Streaming: la respuesta es larga. */
async function ask(schema, user, { effort = 'high', system = SYSTEM } = {}) {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    // Si un clasificador rechaza el pedido, la API lo reintenta en el modelo que recomienda.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: 'user', content: user }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') throw new Error(`El modelo rechazó el pedido (${message.stop_details?.category ?? 'sin categoría'}).`);
  if (message.stop_reason === 'max_tokens') throw new Error('La respuesta se cortó por max_tokens.');
  if (!message.parsed_output) throw new Error('La respuesta no tiene el formato esperado.');
  console.log(`  ${message.model} · ${message.usage.input_tokens} tokens de entrada, ${message.usage.output_tokens} de salida`);
  return message.parsed_output;
}

// ---------------------------------------------------------------------------

function frontmatter(data) {
  return ['---', ...Object.entries(data).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), '---', ''].join('\n');
}

function output(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const delim = `EOF_${Math.random().toString(36).slice(2)}`;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delim}\n${value}\n${delim}\n`);
}

// ---------------------------------------------------------------------------
// Chequeos fijos (no dependen del modelo)

/** Correcciones después de la primera revisión; si siguen los problemas, va a PR. */
const MAX_REVISIONS = 2;
/** Dominios externos que una guía puede enlazar. */
const EXTERNAL_OK = ['gob.pe', 'shalom.com.pe', 'olvacourier.com', 'mathyusolutions.com'];
const departmentSlugs = new Set(Object.values(DEPARTMENT_LABEL).map(slugify));

/** "/v1/sunat/ruc/{ruc}" → /^\/v1\/sunat\/ruc\/[^/]+$/ */
function routeRegex(p) {
  return new RegExp(`^${p.split('/').map((s) => (/^\{.+\}$/.test(s) ? '[^/]+' : s.replace(/[.*+?^$()|[\]\\]/g, '\\$&'))).join('/')}$`);
}

/** Endpoints documentados del sitio (todos, en la central). */
function apiRoutes(siteId) {
  const brands = siteId === 'hub' ? Object.values(BRANDS) : [BRANDS[siteId]];
  return {
    prefixes: new Set(brands.map((b) => b.apiPrefix)),
    routes: brands.flatMap((b) => b.docs.flatMap((s) => s.endpoints.map((e) => routeRegex(e.absolute ? e.path : `${b.apiPrefix}${e.path}`)))),
  };
}

function internalPathOk(siteId, href, guides) {
  const p = href.split(/[?#]/)[0].replace(/(.)\/$/, '$1');
  const pages = new Set(['/', '/docs', '/pricing', ...guides.filter((g) => g.site === siteId).map((g) => `/guias/${g.slug}`)]);
  if (siteId === 'hub') pages.add('/register');
  if (siteId === 'shalom' || siteId === 'olva') {
    pages.add('/agencias');
    if (/^\/agencias\/[a-z-]+$/.test(p) && departmentSlugs.has(p.split('/')[2])) return true;
  }
  if (siteId === 'sunat') {
    pages.add('/tipo-de-cambio');
    pages.add('/catalogos');
    catalogSlugs.forEach((s) => pages.add(`/catalogos/${s}`));
    if (/^\/tipo-de-cambio\/[a-z]+-\d{4}$/.test(p)) return true;
  }
  return pages.has(p) || href.startsWith('#');
}

/** Problemas objetivos de una guía; cada uno dice cómo corregirlo. */
function checkGuide(guide, topic, guides) {
  const issues = [];
  const body = guide.body_markdown;
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 900) issues.push(`La guía tiene ${words} palabras: amplíala a más de 1200 con contenido útil (no relleno).`);
  if (words > 2600) issues.push(`La guía tiene ${words} palabras: recórtala a menos de 1800 quitando lo que no aporta.`);
  if (/^# /m.test(body)) issues.push('Tiene un título de primer nivel (# ): el título va aparte; usa ## para las secciones.');
  if (!/^##\s+Preguntas frecuentes/m.test(body)) issues.push('Falta la sección "## Preguntas frecuentes" al final.');
  if (guide.title.length < 30 || guide.title.length > 70) issues.push(`El título tiene ${guide.title.length} caracteres: déjalo entre 45 y 65.`);
  if (guide.description.length < 100 || guide.description.length > 170) issues.push(`La descripción tiene ${guide.description.length} caracteres: déjala entre 130 y 160.`);

  for (const [, href] of body.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^https?:\/\//.test(href)) {
      const host = new URL(href).hostname;
      if (!EXTERNAL_OK.some((d) => host === d || host.endsWith(`.${d}`))) issues.push(`El link ${href} va a un sitio no permitido: enlaza solo a nuestras páginas o a sitios oficiales (${EXTERNAL_OK.join(', ')}).`);
    } else if (!internalPathOk(topic.site, href, guides)) {
      issues.push(`El link ${href} no es una página del sitio: usa solo las de la lista "Páginas del sitio".`);
    }
  }

  const { prefixes, routes } = apiRoutes(topic.site);
  const seen = new Set();
  for (const [raw] of body.matchAll(/\/v1\/[A-Za-z0-9_\-/{}.]+/g)) {
    const p = raw.replace(/[./]+$/, '');
    if (seen.has(p) || prefixes.has(p) || p.startsWith('/v1/sunat/files/')) continue;
    seen.add(p);
    if (!routes.some((r) => r.test(p))) issues.push(`La ruta ${p} no existe en la API: usa solo los endpoints de los datos del producto.`);
  }
  return issues;
}

async function writeGuide(topic, guides) {
  console.log(`Escribiendo "${topic.slug}" (${topic.site}): ${topic.keyword}`);
  const facts = topic.site === 'hub' ? hubFacts() : brandFacts(BRANDS[topic.site]);
  const related = guides.filter((g) => g.site === topic.site).map((g) => `- /guias/${g.slug}: ${g.title}`);
  const user = [
    `Búsqueda objetivo: "${topic.keyword}"`,
    `Enfoque: ${topic.angle}`,
    '',
    '<datos_del_producto>',
    facts,
    '</datos_del_producto>',
    '',
    'Páginas del sitio que puedes enlazar:',
    ...sitePages(topic.site).map((p) => `- ${p}`),
    ...related,
    '',
    `Fecha de hoy: ${new Date().toISOString().slice(0, 10)}.`,
  ].join('\n');
  if (flag('print-prompt')) {
    console.log(`${SYSTEM}\n\n---\n\n${user}`);
    return null;
  }

  // Escribir → chequear → revisar → corregir, hasta que pase o se acaben las vueltas.
  let guide = await ask(GuideSchema, user);
  let issues = [];
  for (let round = 0; ; round++) {
    const fixed = checkGuide(guide, topic, guides);
    const review = await ask(
      ReviewSchema,
      [user, '', '<guia_a_revisar>', `# ${guide.title}`, `> ${guide.description}`, '', guide.body_markdown, '</guia_a_revisar>'].join('\n'),
      { system: REVIEWER },
    );
    issues = [...fixed, ...(review.approved ? [] : review.issues)];
    console.log(`  Revisión ${round + 1}: ${issues.length ? `${issues.length} problemas` : 'aprobada'}`);
    issues.forEach((i) => console.log(`    - ${i}`));
    if (!issues.length || round === MAX_REVISIONS) break;
    guide = await ask(
      GuideSchema,
      [user, '', 'Esta es tu guía anterior:', '<guia>', JSON.stringify(guide), '</guia>', '', 'Corrige estos problemas y devuelve la guía completa:', ...issues.map((i) => `- ${i}`)].join('\n'),
    );
  }
  const publish = issues.length === 0;

  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(GUIDES_DIR, `${topic.slug}.md`);
  const content =
    frontmatter({ title: guide.title, description: guide.description, site: topic.site, date: today, updated: today, keywords: guide.keywords, draft: false }) +
    '\n' +
    guide.body_markdown.trim() +
    '\n';

  const words = guide.body_markdown.split(/\s+/).filter(Boolean).length;
  console.log(`  "${guide.title}" · ${words} palabras · ${publish ? 'se publica' : 'queda para revisión humana'}`);
  if (dryRun) {
    console.log(content);
    return guide;
  }
  fs.mkdirSync(GUIDES_DIR, { recursive: true });
  fs.writeFileSync(file, content);
  if (!publish) {
    // El tema queda marcado en el backlog (eso sí va a main): la próxima corrida sigue con
    // otro en vez de reintentar este. La guía espera en su PR.
    const backlog = readBacklog().map((t) => (t.slug === topic.slug ? { ...t, skip: true, review: 'PR pendiente' } : t));
    fs.writeFileSync(BACKLOG_FILE, `${JSON.stringify(backlog, null, 2)}\n`);
  }

  const host = topic.site === 'hub' ? HUB.hosts[0] : BRANDS[topic.site].hosts[0];
  const notes = [
    `Guía para **${host}/guias/${topic.slug}**, escrita por ${MODEL} para la búsqueda _${topic.keyword}_ (${words} palabras).`,
    '',
    ...(publish
      ? ['Pasó los chequeos y la revisión automática.']
      : [
          `No pasó la revisión automática después de ${MAX_REVISIONS} correcciones, así que no se publicó sola. Corrige lo que queda y haz merge (o cierra el PR para descartarla).`,
          '',
          '### Problemas pendientes',
          ...issues.map((i) => `- [ ] ${i}`),
        ]),
    '',
    '### Notas del autor',
    ...guide.review_notes.map((n) => `- ${n}`),
  ].join('\n');
  if (process.env.NOTES_FILE) fs.writeFileSync(process.env.NOTES_FILE, `${notes}\n`);
  output('slug', topic.slug);
  output('title', guide.title);
  output('publish', String(publish));
  return guide;
}

async function refillBacklog(backlog, guides) {
  const pending = backlog.filter((t) => !t.skip && !done(t));
  if (pending.length >= MIN_PENDING) return;
  console.log(`Quedan ${pending.length} temas pendientes: pidiendo ideas nuevas…`);
  const covered = [...backlog.map((t) => `- [${t.site}] ${t.keyword}`), ...guides.map((g) => `- [${g.site}] ${g.title}`)];
  const user = [
    'Propón 8 temas nuevos para guías del blog que no repitan los que ya existen.',
    'Prioriza búsquedas con intención clara de alguien que vende por internet o desarrolla en Perú y que nuestra API resuelve. Reparte entre sunat, shalom, olva y hub.',
    '',
    '<datos_del_producto>',
    hubFacts(),
    '</datos_del_producto>',
    '',
    'Temas que ya existen:',
    ...covered,
  ].join('\n');
  const { topics } = await ask(IdeasSchema, user, { effort: 'medium' });
  const slugs = new Set(backlog.map((t) => t.slug));
  const fresh = topics
    .map((t) => ({ ...t, slug: slugify(t.slug) }))
    .filter((t) => t.slug && !slugs.has(t.slug));
  console.log(`  ${fresh.length} temas nuevos: ${fresh.map((t) => t.slug).join(', ')}`);
  if (!dryRun && fresh.length) fs.writeFileSync(BACKLOG_FILE, `${JSON.stringify([...backlog, ...fresh], null, 2)}\n`);
}

/** --check <archivo.md>: corre los chequeos fijos sobre una guía ya escrita (sin la API). */
function checkFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const [, head = '', ...rest] = raw.split(/^---\s*$/m);
  const get = (k) => {
    const m = new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(head);
    return m ? JSON.parse(m[1]) : '';
  };
  const guide = { title: get('title'), description: get('description'), body_markdown: rest.join('---') };
  const issues = checkGuide(guide, { site: get('site') }, existingGuides());
  console.log(issues.length ? issues.map((i) => `- ${i}`).join('\n') : 'Sin problemas.');
  process.exitCode = issues.length ? 1 : 0;
}

async function main() {
  if (option('check')) return checkFile(option('check'));
  const guides = existingGuides();
  const wanted = option('slug');
  // Primero se repone el backlog (si hace falta): así nunca se queda una semana sin guía.
  if (!wanted && !flag('print-prompt')) await refillBacklog(readBacklog(), guides);

  const backlog = readBacklog();
  const topic = wanted ? backlog.find((t) => t.slug === wanted) : backlog.find((t) => !t.skip && !done(t));
  if (wanted && !topic) throw new Error(`No hay un tema "${wanted}" en ${path.relative(ROOT, BACKLOG_FILE)}.`);
  if (wanted && done(topic)) throw new Error(`La guía "${wanted}" ya existe.`);
  if (!topic) {
    console.log('No hay temas pendientes en el backlog.');
    return;
  }
  await writeGuide(topic, guides);
}

try {
  await main();
} catch (e) {
  if (e instanceof Anthropic.AuthenticationError) console.error('ANTHROPIC_API_KEY no es válida.');
  else if (e instanceof Anthropic.RateLimitError) console.error('Límite de la API de Anthropic: vuelve a intentarlo más tarde.');
  else if (e instanceof Anthropic.APIError) console.error(`Error de la API de Anthropic (${e.status}): ${e.message}`);
  else console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
