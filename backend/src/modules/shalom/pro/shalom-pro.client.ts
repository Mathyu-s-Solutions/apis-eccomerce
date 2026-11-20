import { Inject, Injectable } from '@nestjs/common';
import { UpstreamError } from '../../../common/errors/upstream.error';
import { CONFIG_TOKEN, type AppConfig } from '../../../config/configuration';
import { CAPTCHA_PROVIDER, type CaptchaProvider } from '../../../common/captcha/captcha.provider';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
export const SHALOM_PRO = 'shalom-pro';
const TIMEOUT_MS = 30_000;
/** Hosts de los que se aceptan descargas (el rótulo puede venir de su servidor de archivos). */
const DOWNLOAD_HOSTS = /(^|\.)(shalom\.pe|shalom\.com\.pe|shalomcontrol\.com)$/i;

/**
 * Cookies de una sesión de Shalom Pro. Es Laravel Sanctum en modo SPA:
 * `XSRF-TOKEN` (se devuelve en la cabecera X-XSRF-TOKEN), la sesión
 * (`enviashalom_session`, 1 h) y la de "recordarme" del login.
 */
export class CookieJar {
  private readonly cookies: Map<string, string>;

  constructor(entries: Record<string, string> = {}) {
    this.cookies = new Map(Object.entries(entries));
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  get size(): number {
    return this.cookies.size;
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  /** Aplica los Set-Cookie de una respuesta; las vacías o vencidas se borran. */
  update(setCookies: string[]): void {
    for (const line of setCookies) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some((attr) => {
        const i = attr.indexOf('=');
        const key = attr.slice(0, i < 0 ? undefined : i).trim().toLowerCase();
        const val = i < 0 ? '' : attr.slice(i + 1).trim();
        return (key === 'max-age' && Number(val) <= 0) || (key === 'expires' && Date.parse(val) < Date.now());
      });
      if (!value || value === 'deleted' || expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  toJSON(): Record<string, string> {
    return Object.fromEntries(this.cookies);
  }
}

/** Shalom Pro respondió 401: la sesión venció y hay que volver a entrar. */
export class ShalomProSessionExpired extends Error {
  constructor() {
    super('La sesión de Shalom Pro venció');
  }
}

export interface ProResponse {
  status: number;
  body: unknown;
}

export interface ProFile {
  data: Buffer;
  contentType: string;
}

/**
 * La respuesta de Shalom Pro viene como `{ success, message, data }`, a veces
 * anidada (`data.data`). Devuelve el cuerpo y sus `data`, de afuera hacia adentro.
 */
export function layers(body: unknown): Array<Record<string, any>> {
  const out: Array<Record<string, any>> = [];
  let cur: unknown = body;
  for (let i = 0; i < 3 && cur && typeof cur === 'object' && !Array.isArray(cur); i++) {
    out.push(cur as Record<string, any>);
    cur = (cur as Record<string, unknown>).data;
  }
  return out;
}

/** La primera capa de la respuesta que cumple `test`. */
export function pick(body: unknown, test: (layer: Record<string, any>) => boolean): Record<string, any> | undefined {
  return layers(body).find(test);
}

/** Mensaje de error legible: el `message` de Shalom o el primero de la validación de Laravel. */
export function messageOf(body: unknown): string | undefined {
  if (typeof body === 'string') return body.length && body.length < 300 && !body.trimStart().startsWith('<') ? body : undefined;
  for (const layer of layers(body)) {
    const errors = layer.errors;
    if (errors && typeof errors === 'object') {
      const first = Object.values(errors as Record<string, unknown>)[0];
      const msg = Array.isArray(first) ? first[0] : first;
      if (typeof msg === 'string' && msg) return msg;
    }
    if (typeof layer.message === 'string' && layer.message) return layer.message;
    if (typeof layer.error === 'string' && layer.error) return layer.error;
  }
  return undefined;
}

/** `true` si alguna capa trae `success: false`. */
export function failed(body: unknown): boolean {
  return layers(body).some((l) => l.success === false);
}

/**
 * Cliente del portal Shalom Pro (pro.shalom.pe), una SPA en Vue sobre Laravel
 * Sanctum. Las rutas cuelgan de /api/v1 y van con las cookies de la sesión del
 * cliente más la cabecera X-XSRF-TOKEN. Ver docs/investigacion-upstreams.md §1.2.
 */
@Injectable()
export class ShalomProClient {
  constructor(
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
    @Inject(CAPTCHA_PROVIDER) private readonly captcha: CaptchaProvider,
  ) {}

  private get base(): string {
    return this.config.shalom.proBase.replace(/\/+$/, '');
  }

  /** Entra con la cuenta del cliente. Resuelve un reCAPTCHA (action login) en pro.shalom.pe. */
  async login(email: string, password: string): Promise<CookieJar> {
    const jar = new CookieJar();
    await this.csrf(jar);
    const recaptchaToken = await this.captcha.getToken('login', 'pro');
    const res = await this.send(jar, 'POST', '/auth/login', { email, password, remember: true, recaptcha_token: recaptchaToken });
    if (res.status === 419) throw new UpstreamError(SHALOM_PRO, 'Shalom Pro rechazó el token de seguridad del login.', { status: 502, detail: res.body });
    if (res.status >= 500) throw new UpstreamError(SHALOM_PRO, `Shalom Pro respondió ${res.status} al iniciar sesión.`, { status: 502 });
    if (res.status >= 400 || failed(res.body)) {
      throw new UpstreamError(SHALOM_PRO, `Shalom Pro no aceptó el ingreso: ${messageOf(res.body) ?? 'revisa el correo y la contraseña'}.`, { status: 400 });
    }
    return jar;
  }

  /** Llamada autenticada. Lanza ShalomProSessionExpired con 401 y UpstreamError si Shalom la rechaza. */
  async call<T = unknown>(jar: CookieJar, method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
    const res = await this.request(jar, method, path, body);
    if (res.status >= 400 || failed(res.body)) throw this.error(path, res);
    return res.body as T;
  }

  /** Como `call`, pero devuelve las respuestas de error 4xx (p. ej. "no encontrado") en vez de lanzarlas. */
  async request(jar: CookieJar, method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<ProResponse> {
    let res = await this.send(jar, method, path, body);
    // 419: el token CSRF venció; se pide otro y se reintenta una vez, como su front.
    if (res.status === 419) {
      await this.csrf(jar);
      res = await this.send(jar, method, path, body);
    }
    if (res.status === 401) throw new ShalomProSessionExpired();
    if (res.status >= 500) throw this.error(path, res);
    return res;
  }

  /** Descarga un archivo (PDF del rótulo o del ticket). Las cookies solo van a pro.shalom.pe. */
  async download(jar: CookieJar, url: string): Promise<ProFile> {
    const target = new URL(url, `${this.base}/`);
    const own = target.origin === new URL(this.base).origin;
    if (target.protocol !== 'https:' && !own) throw new UpstreamError(SHALOM_PRO, 'Shalom Pro devolvió un enlace de descarga no seguro.', { status: 502 });
    if (!own && !DOWNLOAD_HOSTS.test(target.hostname)) {
      throw new UpstreamError(SHALOM_PRO, `Shalom Pro devolvió un enlace de descarga de otro dominio (${target.hostname}).`, { status: 502 });
    }
    let res: Response;
    try {
      res = await fetch(target, {
        headers: { 'user-agent': UA, accept: 'application/pdf,*/*', referer: `${this.base}/`, ...(own && jar.size ? { cookie: jar.header() } : {}) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw this.networkError('la descarga', err);
    }
    if (own) jar.update(res.headers.getSetCookie?.() ?? []);
    if (own && res.status === 401) throw new ShalomProSessionExpired();
    const data = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? '';
    const isPdf = data.subarray(0, 5).toString('latin1') === '%PDF-';
    if (!res.ok || !isPdf) {
      let body: unknown = data.toString('utf8');
      try {
        body = JSON.parse(body as string);
      } catch {
        /* no es JSON */
      }
      throw new UpstreamError(SHALOM_PRO, `Shalom Pro no entregó el PDF: ${messageOf(body) ?? `respondió ${res.status} (${contentType || 'sin tipo'})`}.`, {
        status: res.status === 404 ? 404 : 502,
      });
    }
    return { data, contentType: 'application/pdf' };
  }

  /** Pide la cookie XSRF-TOKEN (y abre la sesión), como hace su front antes del login. */
  private async csrf(jar: CookieJar): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/sanctum/csrf-cookie`, { headers: this.headers(jar), signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw this.networkError('/sanctum/csrf-cookie', err);
    }
    jar.update(res.headers.getSetCookie?.() ?? []);
    if (!jar.get('XSRF-TOKEN')) throw new UpstreamError(SHALOM_PRO, `Shalom Pro no devolvió el token CSRF (${res.status}).`, { status: 502 });
  }

  private headers(jar: CookieJar): Record<string, string> {
    const xsrf = jar.get('XSRF-TOKEN');
    return {
      'user-agent': UA,
      accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest',
      origin: this.base,
      referer: `${this.base}/`,
      ...(xsrf ? { 'x-xsrf-token': decodeURIComponent(xsrf) } : {}),
      ...(jar.size ? { cookie: jar.header() } : {}),
    };
  }

  private async send(jar: CookieJar, method: string, path: string, body?: unknown): Promise<ProResponse> {
    const clean = path.startsWith('/') ? path : `/${path}`;
    let res: Response;
    try {
      res = await fetch(`${this.base}/api/v1${clean}`, {
        method,
        headers: { ...this.headers(jar), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw this.networkError(clean, err);
    }
    jar.update(res.headers.getSetCookie?.() ?? []);
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* HTML u otro texto */
    }
    return { status: res.status, body: parsed };
  }

  private error(path: string, res: ProResponse): UpstreamError {
    const message = messageOf(res.body) ?? `Shalom Pro respondió ${res.status} en ${path}`;
    const status = res.status >= 500 ? 502 : res.status === 404 ? 404 : 400;
    return new UpstreamError(SHALOM_PRO, message, { status, detail: res.status >= 500 ? undefined : res.body });
  }

  private networkError(what: string, err: unknown): UpstreamError {
    if (err instanceof Error && err.name === 'TimeoutError') return UpstreamError.timeout(SHALOM_PRO, TIMEOUT_MS);
    return new UpstreamError(SHALOM_PRO, `Fallo de red con Shalom Pro en ${what}`, { cause: err });
  }
}
