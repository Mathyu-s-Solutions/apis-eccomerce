import { Inject, Injectable, Logger } from '@nestjs/common';
import { CAPTCHA_PROVIDER, type CaptchaProvider } from '../../../common/captcha/captcha.provider';
import { UpstreamError } from '../../../common/errors/upstream.error';
import { CONFIG_TOKEN, type AppConfig } from '../../../config/configuration';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
export const OLVA_REGISTRO = 'olva-registro';
const TIMEOUT_MS = 30_000;
/** Credenciales públicas del flujo de invitado (vienen en el front de registrodeenvios). */
const GUEST = { grant_type: 'client_credentials', client_id: 'app_web_id', client_secret: '123456' };
/** Palabras con las que su front detecta que el servidor rechazó el captcha (y reintenta). */
const CAPTCHA_WORDS = ['captcha', 'recaptcha', 're-captcha', 'score'];

/**
 * `always`: manda X-Recaptcha-Token (escrituras, como su front).
 * `on-demand`: va sin token y solo si el servidor lo pide se reintenta con uno
 * (catálogos y consultas que hoy responden sin captcha).
 */
export type CaptchaMode = 'always' | 'on-demand';

export interface RegistroResponse {
  status: number;
  body: any;
}

/** Mensaje legible de un error de Olva (problem+json: `detail` y `errors[].detail`). */
export function olvaMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body.length && body.length < 300 && !body.trimStart().startsWith('<') ? body : undefined;
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, any>;
  const first = Array.isArray(b.errors) ? b.errors.find((e: any) => typeof e?.detail === 'string')?.detail : undefined;
  const detail = typeof b.detail === 'string' ? b.detail : typeof b.message === 'string' ? b.message : typeof b.title === 'string' ? b.title : undefined;
  if (detail && first && !detail.includes(first)) return `${detail} ${first}`.trim();
  return detail ?? first;
}

function mentionsCaptcha(body: unknown): boolean {
  const text = (typeof body === 'string' ? body : JSON.stringify(body ?? '')).toLowerCase();
  return CAPTCHA_WORDS.some((w) => text.includes(w));
}

/**
 * Cliente del registro de envíos de Olva (service-registro-envios-prod, el
 * backend de registrodeenvios.olvacourier.com). Es el flujo de invitado: token
 * `client_credentials` de 15 min, sin cuenta del cliente. Cada acción lleva un
 * reCAPTCHA Enterprise con su `action`. Ver docs/investigacion-upstreams.md §2.3.
 */
@Injectable()
export class OlvaRegistroClient {
  private readonly logger = new Logger(OlvaRegistroClient.name);
  private token: { value: string; expiresAt: number } | null = null;
  private tokenLoading: Promise<string> | null = null;

  constructor(
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
    @Inject(CAPTCHA_PROVIDER) private readonly captcha: CaptchaProvider,
  ) {}

  private get base(): string {
    return this.config.olva.registroApi.replace(/\/+$/, '');
  }

  /** Llamada que lanza UpstreamError si Olva responde error. */
  async call<T = any>(method: string, path: string, body: unknown, action: string, mode: CaptchaMode = 'always'): Promise<T> {
    const res = await this.request(method, path, body, action, mode);
    if (res.status >= 400) throw this.error(path, res);
    return res.body as T;
  }

  /** Como `call`, pero devuelve los 4xx (p. ej. 404 de una persona nueva) en vez de lanzarlos. */
  async request(method: string, path: string, body: unknown, action: string, mode: CaptchaMode = 'always'): Promise<RegistroResponse> {
    let res = await this.send(method, path, body, mode === 'always' ? await this.captcha.getToken(action, 'olva') : undefined);
    // Token de acceso vencido: uno nuevo y otra vez.
    if (res.status === 401) {
      this.token = null;
      res = await this.send(method, path, body, mode === 'always' ? await this.captcha.getToken(action, 'olva') : undefined);
    }
    // Captcha rechazado (o pedido): otro token y otra vez, como su front.
    if (res.status >= 400 && mentionsCaptcha(res.body)) {
      this.logger.warn(`Olva pidió/rechazó el captcha en ${method} ${path} (${res.status}); reintento con token nuevo`);
      res = await this.send(method, path, body, await this.captcha.getToken(action, 'olva'));
    }
    if (res.status >= 500) throw this.error(path, res);
    return res;
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) return this.token.value;
    if (this.tokenLoading) return this.tokenLoading;
    this.tokenLoading = (async () => {
      let res = await this.raw('POST', '/v1/token', GUEST, {});
      if (res.status >= 400 && mentionsCaptcha(res.body)) {
        res = await this.raw('POST', '/v1/token', GUEST, { 'x-recaptcha-token': await this.captcha.getToken('auth_login', 'olva') });
      }
      const value = res.body?.access_token;
      if (res.status >= 400 || typeof value !== 'string') {
        throw new UpstreamError(OLVA_REGISTRO, `Olva no entregó el token de acceso (${res.status}).`, { status: 502 });
      }
      const ttl = Number(res.body?.expires_in) > 0 ? Number(res.body.expires_in) * 1000 : 15 * 60_000;
      this.token = { value, expiresAt: Date.now() + ttl };
      return value;
    })().finally(() => {
      this.tokenLoading = null;
    });
    return this.tokenLoading;
  }

  private async send(method: string, path: string, body: unknown, captchaToken?: string): Promise<RegistroResponse> {
    const headers: Record<string, string> = { authorization: `Bearer ${await this.accessToken()}` };
    if (captchaToken) headers['x-recaptcha-token'] = captchaToken;
    return this.raw(method, path, body, headers);
  }

  private async raw(method: string, path: string, body: unknown, extra: Record<string, string>): Promise<RegistroResponse> {
    const web = this.config.olva.registroWeb.replace(/\/+$/, '');
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          'user-agent': UA,
          accept: 'application/json',
          origin: web,
          referer: `${web}/`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') throw UpstreamError.timeout(OLVA_REGISTRO, TIMEOUT_MS);
      throw new UpstreamError(OLVA_REGISTRO, `Fallo de red con el registro de Olva en ${path.split('?')[0]}`, { cause: err });
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* texto */
    }
    return { status: res.status, body: parsed };
  }

  private error(path: string, res: RegistroResponse): UpstreamError {
    const message = olvaMessage(res.body) ?? `Olva respondió ${res.status} en ${path.split('?')[0]}`;
    const status = res.status >= 500 ? 502 : res.status === 404 ? 404 : 400;
    return new UpstreamError(OLVA_REGISTRO, message, { status, detail: res.status >= 500 ? undefined : res.body });
  }
}
