// Probe del proxy web de shalom.com.pe (solo endpoints públicos de lectura)
import crypto from "node:crypto";
import fs from "node:fs";

const BASE = "https://shalom.com.pe";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const sessionKey = crypto.randomBytes(32).toString("base64");
let cookies = [];

function decrypt(b64) {
  const raw = Buffer.from(b64, "base64");
  const iv = raw.subarray(0, 16);
  const ct = raw.subarray(16);
  const d = crypto.createDecipheriv("aes-256-cbc", Buffer.from(sessionKey, "base64"), iv);
  const txt = Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  try { return JSON.parse(txt); } catch { return txt; }
}

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      Origin: BASE,
      Referer: BASE + "/agencias",
      ...(cookies.length ? { Cookie: cookies.join("; ") } : {}),
      ...opts.headers,
    },
  });
  const set = res.headers.getSetCookie?.() || [];
  for (const c of set) cookies.push(c.split(";")[0]);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: res.status, headers: Object.fromEntries(res.headers), body };
}

const s = await req("/api/local/session", { headers: { "X-Session-Key": sessionKey } });
console.log("SESSION", s.status, JSON.stringify(s.body).slice(0, 200));
const csrf = s.body?.csrf;

async function web(path, data = {}) {
  const r = await req("/api/v1/web/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Proxy-Token": csrf, "X-Session-Key": sessionKey },
    body: JSON.stringify(data),
  });
  if (r.body?.encrypted && r.body?.data) r.body = decrypt(r.body.data);
  return r;
}

const v = await web("agencias/version");
console.log("VERSION", v.status, JSON.stringify(v.body).slice(0, 200));
const l = await web("agencias/listar");
console.log("LISTAR", l.status, Array.isArray(l.body?.data) ? `${l.body.data.length} agencias` : JSON.stringify(l.body).slice(0, 300));
if (Array.isArray(l.body?.data)) {
  console.log("SAMPLE", JSON.stringify(l.body.data[0]).slice(0, 1200));
  fs.writeFileSync(process.argv[2] || "agencias.json", JSON.stringify(l.body.data, null, 1));
}
const t = await web("tarifa/mostrar", { origin: 20, destiny: "17", recaptcha_token: "" });
console.log("TARIFA (sin recaptcha)", t.status, JSON.stringify(t.body).slice(0, 300));
