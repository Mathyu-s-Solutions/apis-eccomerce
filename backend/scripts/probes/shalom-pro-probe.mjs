// Prueba la integración con Shalom Pro (pro.shalom.pe) con una cuenta real,
// SOLO con rutas de lectura: login, perfil, agencias, productos y una tarifa.
// No crea guías. Sirve para confirmar la forma de las respuestas que usa
// src/modules/shalom/pro/shalom-pro.service.ts.
//
//   SHALOM_PRO_EMAIL=... SHALOM_PRO_PASSWORD=... node scripts/probes/shalom-pro-probe.mjs [origen] [destino]
//
// Requiere Chromium de Playwright (pnpm exec playwright install chromium).
import { chromium } from 'playwright';

const BASE = 'https://pro.shalom.pe';
const SITEKEY = '6LeGp5EtAAAAADF5427odqjDKEoxPudnerojGTt2';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const [origin = '220', destination = '7'] = process.argv.slice(2);
const { SHALOM_PRO_EMAIL: email, SHALOM_PRO_PASSWORD: password } = process.env;
if (!email || !password) {
  console.error('Define SHALOM_PRO_EMAIL y SHALOM_PRO_PASSWORD.');
  process.exit(1);
}

// 1) Token reCAPTCHA v3 (action login) generado en pro.shalom.pe/login.
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ userAgent: UA, locale: 'es-PE' })).newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => !!window.grecaptcha, { timeout: 20000 });
const token = await page.evaluate(async (key) => {
  await new Promise((r) => window.grecaptcha.ready(r));
  return window.grecaptcha.execute(window.RECAPTCHA_SITE_KEY || key, { action: 'login' });
}, SITEKEY);
await browser.close();
console.log('token reCAPTCHA:', token.length, 'caracteres');

// 2) Sesión Sanctum: cookies + X-XSRF-TOKEN.
const jar = new Map();
const keep = (res) => {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
};
const headers = () => ({
  'user-agent': UA,
  accept: 'application/json',
  'x-requested-with': 'XMLHttpRequest',
  origin: BASE,
  referer: `${BASE}/`,
  'x-xsrf-token': decodeURIComponent(jar.get('XSRF-TOKEN') ?? ''),
  cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
});
async function api(method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { ...headers(), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  keep(res);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text.slice(0, 200);
  }
  return { status: res.status, json };
}
/** Muestra la forma (claves y tipos), no los datos personales. */
const shape = (v, depth = 0) => {
  if (Array.isArray(v)) return depth > 2 ? `[${v.length}]` : [`(${v.length} elementos)`, v.length ? shape(v[0], depth + 1) : null];
  if (v && typeof v === 'object') return depth > 3 ? '{…}' : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x, depth + 1)]));
  return typeof v;
};

keep(await fetch(`${BASE}/sanctum/csrf-cookie`, { headers: headers() }));
console.log('cookies tras csrf-cookie:', [...jar.keys()].join(', '));

const login = await api('POST', '/auth/login', { email, password, remember: true, recaptcha_token: token });
console.log('\nPOST /auth/login →', login.status, JSON.stringify(shape(login.json)));
console.log('cookies tras login:', [...jar.keys()].join(', '));
if (login.status >= 400) process.exit(1);

const me = await api('GET', '/auth/me');
console.log('\nGET /auth/me →', me.status, JSON.stringify(shape(me.json), null, 1));

const terminals = await api('POST', '/envia_ya/terminals');
const map = terminals.json?.Map ?? terminals.json?.data?.Map ?? [];
console.log('\nPOST /envia_ya/terminals →', terminals.status, `${map.length} agencias`);
const pick = (id) => map.find((t) => String(t.ter_id) === id);
for (const id of [origin, destination]) {
  const t = pick(id);
  console.log(` ${id}:`, t ? { ter_id: t.ter_id, lugar_over: t.lugar_over, origen: t.origen, destino: t.destino, ter_habilitado_OS: t.ter_habilitado_OS, ter_aereo: t.ter_aereo, origenes_aereos: t.origenes_aereos } : 'no está');
}

const products = await api('POST', '/envia_ya/products');
const list = Array.isArray(products.json) ? products.json : (products.json?.data ?? []);
console.log('\nPOST /envia_ya/products →', products.status, JSON.stringify(shape(products.json)));
for (const p of Array.isArray(list) ? list : []) console.log(` id=${p.id} "${p.title}"`);

const tariff = await api('POST', '/envia_ya/tariff/calculate', { origin: pick(origin)?.ter_id ?? origin, destiny: pick(destination)?.ter_id ?? destination, width: '', height: '', length: '', weight: '' });
console.log(`\nPOST /envia_ya/tariff/calculate ${origin}→${destination} →`, tariff.status, JSON.stringify(tariff.json));

await api('POST', '/auth/logout');
console.log('\nListo (sesión cerrada). No se creó ninguna guía.');
