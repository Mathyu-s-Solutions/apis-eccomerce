import { createHash } from 'node:crypto';
import type { SolCredentials, SunatEnvironment } from './bill-service';
import { SunatFault, SunatUnavailable } from './bill-service';

/**
 * API REST de SUNAT para guías de remisión electrónicas (GRE). En beta se usa
 * el entorno de pruebas público que simula la API (no existe uno oficial).
 */
export const GRE_ENDPOINTS: Record<SunatEnvironment, { auth: string; cpe: string }> = {
  beta: { auth: 'https://gre-test.nubefact.com/v1', cpe: 'https://gre-test.nubefact.com/v1' },
  produccion: { auth: 'https://api-seguridad.sunat.gob.pe/v1', cpe: 'https://api-cpe.sunat.gob.pe/v1' },
};

/** Credenciales de pruebas del entorno beta de guías. */
export const GRE_BETA = {
  clientId: 'test-85e5b0ae-255c-4891-a595-0b98c65c9854',
  clientSecret: 'test-Hty/M6QshYvPgItX2P0+Kw==',
  user: 'MODDATOS',
  password: 'MODDATOS',
} as const;

export interface GreCredentials {
  clientId: string;
  clientSecret: string;
  sol: SolCredentials;
}

export interface GreStatus {
  /** 0 = aceptada, 98 = en proceso, 99 = con errores. */
  code: string;
  cdr?: Buffer;
  error?: { code: string; message: string };
}

interface Token {
  value: string;
  expiresAt: number;
}

export class GreApiClient {
  private readonly tokens = new Map<string, Token>();
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;

  constructor(opts: { timeoutMs?: number; fetch?: typeof fetch } = {}) {
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetch = opts.fetch ?? fetch;
  }

  /** Envía la guía (ZIP con el XML firmado). Devuelve el ticket para consultar el resultado. */
  async send(env: SunatEnvironment, cred: GreCredentials, name: string, zip: Uint8Array): Promise<string> {
    const body = { archivo: { nomArchivo: `${name}.zip`, arcGreZip: Buffer.from(zip).toString('base64'), hashZip: createHash('sha256').update(zip).digest('hex') } };
    const res = await this.call(env, cred, 'POST', `/contribuyente/gem/comprobantes/${name}`, body);
    const ticket = res?.numTicket;
    if (!ticket) throw new SunatUnavailable('SUNAT respondió sin ticket al envío de la guía');
    return String(ticket);
  }

  async status(env: SunatEnvironment, cred: GreCredentials, ticket: string): Promise<GreStatus> {
    const res = await this.call(env, cred, 'GET', `/contribuyente/gem/comprobantes/envios/${encodeURIComponent(ticket)}`);
    const code = String(res?.codRespuesta ?? '').trim();
    if (!code) throw new SunatUnavailable('SUNAT respondió sin estado a la consulta del ticket');
    return {
      code,
      cdr: res.arcCdr && String(res.indCdrGenerado ?? '1') === '1' ? Buffer.from(String(res.arcCdr), 'base64') : undefined,
      error: res.error ? { code: String(res.error.numError ?? ''), message: String(res.error.desError ?? '') } : undefined,
    };
  }

  private async token(env: SunatEnvironment, cred: GreCredentials): Promise<string> {
    const key = `${env}:${cred.clientId}:${cred.sol.ruc}`;
    const cached = this.tokens.get(key);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
    const form = new URLSearchParams({
      grant_type: 'password',
      scope: 'https://api-cpe.sunat.gob.pe',
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
      username: `${cred.sol.ruc}${cred.sol.user}`,
      password: cred.sol.password,
    });
    const { status, json } = await this.request(`${GRE_ENDPOINTS[env].auth}/clientessol/${encodeURIComponent(cred.clientId)}/oauth2/token/`, {
      method: 'POST',
      // Exactamente este Content-Type: con "; charset=UTF-8" el servicio lo rechaza.
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (status !== 200 || !json?.access_token) {
      const detail = json?.error_description ?? json?.error ?? json?.msg ?? `HTTP ${status}`;
      if (status >= 500) throw new SunatUnavailable(`SUNAT no entregó el token de la API de guías: ${detail}`);
      throw new SunatFault('0102', `SUNAT rechazó las credenciales de la API (client_id, client_secret, usuario o clave SOL): ${detail}`);
    }
    this.tokens.set(key, { value: json.access_token, expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000 });
    return json.access_token;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async call(env: SunatEnvironment, cred: GreCredentials, method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
    const token = await this.token(env, cred);
    const { status, json } = await this.request(`${GRE_ENDPOINTS[env].cpe}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (status >= 200 && status < 300) return json;
    if (status === 401) this.tokens.clear();
    // 422: errores de validación ({ errors: [{ cod, msg }] }); 500: { cod, msg }.
    const first = Array.isArray(json?.errors) ? json.errors[0] : json;
    const code = String(first?.cod ?? '').trim();
    const message = String(first?.msg ?? json?.message ?? `HTTP ${status}`).trim();
    if (status === 422 || (code && status < 500)) throw new SunatFault(code, message);
    if (status >= 500 && code && Number(code) >= 1000) throw new SunatFault(code, message);
    throw new SunatUnavailable(`La API de guías de SUNAT respondió HTTP ${status}: ${message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async request(url: string, init: RequestInit): Promise<{ status: number; json: any }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(url, { ...init, signal: ac.signal });
      const text = await res.text();
      let json;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = undefined;
      }
      return { status: res.status, json };
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      throw new SunatUnavailable(aborted ? `SUNAT no respondió en ${this.timeoutMs / 1000} s` : 'No se pudo conectar con la API de guías de SUNAT', { cause: e });
    } finally {
      clearTimeout(timer);
    }
  }
}
