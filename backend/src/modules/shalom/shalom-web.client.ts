import crypto from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { UpstreamError } from '../../common/errors/upstream.error';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

interface Session {
  sessionKey: string; // base64 de 32 bytes, elegido por el cliente
  csrf: string;
  expiresAt: number; // epoch segundos
  cookies: string[];
}

/** POST dentro de una sesión de Shalom. */
export type ShalomPost = <T = unknown>(
  path: string,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
) => Promise<T>;

/**
 * Cliente del proxy web de shalom.com.pe (/api/v1/web/*).
 * Protocolo reproducido en scripts/probes/shalom-probe.mjs y documentado en
 * docs/investigacion-upstreams.md §1.1:
 *   1) sessionKey aleatoria (cliente)  2) GET /api/local/session -> csrf
 *   3) POST /api/v1/web/<ruta> con X-Proxy-Token + X-Session-Key
 *   4) respuesta puede venir AES-256-CBC cifrada con la sessionKey
 */
@Injectable()
export class ShalomWebClient {
  private readonly logger = new Logger(ShalomWebClient.name);
  private readonly UPSTREAM = 'shalom';
  private session: Session | null = null;

  constructor(@Inject(CONFIG_TOKEN) private readonly config: AppConfig) {}

  private get base(): string {
    return this.config.shalom.webBase;
  }

  /** La sesión compartida (agencias, ubicaciones, tarifas): se renueva al vencer. */
  private async ensureSession(): Promise<Session> {
    const now = Math.floor(Date.now() / 1000);
    if (this.session && now < this.session.expiresAt - 5) return this.session;
    this.session = await this.openSession();
    return this.session;
  }

  /**
   * Corre `fn` en una sesión nueva, solo suya. Desde nov-2026 Shalom guarda en la
   * sesión la orden buscada y `rastrea/estados` solo responde esa ("Busque
   * nuevamente la orden de servicio." si no): buscar y estados van en la misma
   * sesión y no en la compartida, donde otra búsqueda a la vez la pisaría.
   */
  async isolated<T>(fn: (post: ShalomPost) => Promise<T>): Promise<T> {
    const s = await this.openSession();
    return fn((path, body, extraHeaders) => this.request(s, path, body, extraHeaders));
  }

  private async openSession(): Promise<Session> {
    const now = Math.floor(Date.now() / 1000);
    const sessionKey = crypto.randomBytes(32).toString('base64');
    let res: Response;
    try {
      res = await fetch(`${this.base}/api/local/session`, {
        headers: {
          'user-agent': UA,
          'x-requested-with': 'XMLHttpRequest',
          'x-session-key': sessionKey,
          origin: this.base,
          referer: `${this.base}/rastrea`,
        },
      });
    } catch (err) {
      throw new UpstreamError(this.UPSTREAM, 'No se pudo abrir sesión con Shalom', {
        cause: err,
      });
    }
    const cookies = res.headers.getSetCookie?.() ?? [];
    const body = (await res.json().catch(() => null)) as {
      csrf?: string;
      expiresAt?: number;
    } | null;
    if (!body?.csrf) {
      throw new UpstreamError(this.UPSTREAM, 'Shalom no devolvió token de sesión', {
        status: 502,
      });
    }
    return {
      sessionKey,
      csrf: body.csrf,
      // Shalom da 120 s.
      expiresAt: body.expiresAt ?? now + 120,
      cookies: cookies.map((c) => c.split(';')[0]),
    };
  }

  /** POST a /api/v1/web/<path> en la sesión compartida, descifrando la respuesta si viene cifrada. */
  async post<T = unknown>(
    path: string,
    body: Record<string, unknown>,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    return this.request(await this.ensureSession(), path, body, extraHeaders);
  }

  private async request<T = unknown>(
    s: Session,
    path: string,
    body: Record<string, unknown>,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const clean = path.startsWith('/') ? path : `/${path}`;
    let res: Response;
    try {
      res = await fetch(`${this.base}/api/v1/web${clean}`, {
        method: 'POST',
        headers: {
          'user-agent': UA,
          'content-type': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
          'x-proxy-token': s.csrf,
          'x-session-key': s.sessionKey,
          origin: this.base,
          referer: `${this.base}/rastrea`,
          ...(s.cookies.length ? { cookie: s.cookies.join('; ') } : {}),
          ...extraHeaders,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new UpstreamError(this.UPSTREAM, `Fallo de red en ${clean}`, { cause: err });
    }

    let payload = (await res.json().catch(() => null)) as any;
    if (payload?.encrypted === true && payload?.data) {
      payload = this.decrypt(s.sessionKey, payload.data);
    }

    if (res.status >= 400 || payload?.success === false) {
      throw new UpstreamError(
        this.UPSTREAM,
        payload?.message ?? `Shalom respondió ${res.status} en ${clean}`,
        { status: res.status >= 500 ? 502 : 400, detail: payload },
      );
    }
    return payload as T;
  }

  private decrypt(sessionKeyB64: string, dataB64: string): unknown {
    try {
      const raw = Buffer.from(dataB64, 'base64');
      const iv = raw.subarray(0, 16);
      const ct = raw.subarray(16);
      const key = Buffer.from(sessionKeyB64, 'base64');
      const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
      const txt = Buffer.concat([d.update(ct), d.final()]).toString('utf8');
      try {
        return JSON.parse(txt);
      } catch {
        return txt;
      }
    } catch (err) {
      throw new UpstreamError(this.UPSTREAM, 'No se pudo descifrar la respuesta de Shalom', {
        cause: err,
      });
    }
  }
}
