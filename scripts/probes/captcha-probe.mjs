// Prototipo: genera un token reCAPTCHA v3 real desde una página de shalom.com.pe
// con Playwright, y comprueba si el servidor de Shalom lo acepta en rastrea/buscar.
import { chromium } from 'playwright';
import crypto from 'node:crypto';

const BASE = 'https://shalom.com.pe';
const FALLBACK_SITEKEY = '6LeGp5EtAAAAADF5427odqjDKEoxPudnerojGTt2';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const action = process.argv[2] || 'rastrea_buscar';
const numero = process.argv[3] || '12345678';
const codigo = process.argv[4] || 'AB12';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: UA, locale: 'es-PE' });
const page = await ctx.newPage();

console.log('navegando a', `${BASE}/rastrea`);
await page.goto(`${BASE}/rastrea`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => !!window.grecaptcha && !!window.RECAPTCHA_SITE_KEY, {
  timeout: 20000,
}).catch(() => console.log('aviso: RECAPTCHA_SITE_KEY no detectada, uso fallback'));

const t0 = Date.now();
const token = await page.evaluate(
  async ({ action, fallback }) => {
    const key = window.RECAPTCHA_SITE_KEY || fallback;
    const g = window.grecaptcha;
    if (!g) throw new Error('grecaptcha no disponible');
    await new Promise((res) => g.ready(res));
    return await g.execute(key, { action });
  },
  { action, fallback: FALLBACK_SITEKEY },
);
console.log(`token (${action}) en ${Date.now() - t0}ms, len=${token.length}:`);
console.log(token.slice(0, 60) + '...');

await browser.close();

// --- Ahora probamos el flujo rastrea/buscar con ese token ---
const sessionKey = crypto.randomBytes(32).toString('base64');
const h = {
  'user-agent': UA,
  'x-requested-with': 'XMLHttpRequest',
  origin: BASE,
  referer: `${BASE}/rastrea`,
};
const sess = await fetch(`${BASE}/api/local/session`, {
  headers: { ...h, 'x-session-key': sessionKey },
});
const cookies = (sess.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]);
const { csrf } = await sess.json();

function decrypt(b64) {
  const raw = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(sessionKey, 'base64'),
    raw.subarray(0, 16),
  );
  const txt = Buffer.concat([d.update(raw.subarray(16)), d.final()]).toString('utf8');
  try { return JSON.parse(txt); } catch { return txt; }
}

const res = await fetch(`${BASE}/api/v1/web/rastrea/buscar`, {
  method: 'POST',
  headers: {
    ...h,
    'content-type': 'application/json',
    'x-proxy-token': csrf,
    'x-session-key': sessionKey,
    ...(cookies.length ? { cookie: cookies.join('; ') } : {}),
  },
  body: JSON.stringify({ numero, codigo, ose_id: '', recaptcha_token: token }),
});
let body = await res.json().catch(() => null);
if (body?.encrypted) body = decrypt(body.data);
console.log('\nrastrea/buscar ->', res.status);
console.log(JSON.stringify(body).slice(0, 400));
console.log(
  '\nVEREDICTO:',
  JSON.stringify(body).includes('seguridad')
    ? '❌ captcha RECHAZADO'
    : '✅ captcha ACEPTADO (pasó la verificación de seguridad)',
);
