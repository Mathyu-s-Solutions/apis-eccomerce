import type { SolCredentials } from './bill-service';
import { SunatFault, SunatUnavailable } from './bill-service';

const SECURITY = 'https://api-seguridad.sunat.gob.pe/v1';

/**
 * Cómo se pide el token de las APIs REST de SUNAT:
 *  - `sol`: credenciales de API + usuario y clave SOL (SIRE, guías).
 *  - `extranet`: solo credenciales de API (consulta de validez).
 */
export type TokenGrant =
  | { kind: 'sol'; scope: string; clientId: string; clientSecret: string; sol: SolCredentials }
  | { kind: 'extranet'; scope: string; clientId: string; clientSecret: string };

export const SCOPES = {
  sire: 'https://api-sire.sunat.gob.pe',
  contribuyentes: 'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes',
} as const;

export interface RestResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}

/**
 * Cliente de las APIs REST de SUNAT (OAuth2): consulta de validez de
 * comprobantes y propuestas del SIRE. Guarda cada token hasta que vence.
 */
export class SunatRestClient {
  private readonly tokens = new Map<string, { value: string; expiresAt: number }>();
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;

  constructor(opts: { timeoutMs?: number; fetch?: typeof fetch } = {}) {
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetch = opts.fetch ?? fetch;
  }

  async token(grant: TokenGrant): Promise<string> {
    const key = [grant.kind, grant.scope, grant.clientId, grant.kind === 'sol' ? grant.sol.ruc + grant.sol.user : ''].join('|');
    const cached = this.tokens.get(key);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

    const form = new URLSearchParams({ scope: grant.scope, client_id: grant.clientId, client_secret: grant.clientSecret });
    let url: string;
    if (grant.kind === 'sol') {
      form.set('grant_type', 'password');
      form.set('username', `${grant.sol.ruc}${grant.sol.user}`);
      form.set('password', grant.sol.password);
      url = `${SECURITY}/clientessol/${encodeURIComponent(grant.clientId)}/oauth2/token/`;
    } else {
      form.set('grant_type', 'client_credentials');
      url = `${SECURITY}/clientesextranet/${encodeURIComponent(grant.clientId)}/oauth2/token/`;
    }
    // Exactamente este Content-Type: con "; charset=UTF-8" SUNAT lo rechaza.
    const { status, json } = await this.raw(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    if (status !== 200 || !json?.access_token) {
      const detail = json?.error_description ?? json?.error ?? json?.msg ?? `HTTP ${status}`;
      if (status >= 500) throw new SunatUnavailable(`SUNAT no entregó el token de su API: ${detail}`);
      throw new SunatFault('0102', `SUNAT rechazó las credenciales de API de la empresa (api_client_id, api_client_secret${grant.kind === 'sol' ? ', usuario o clave SOL' : ''}): ${detail}`);
    }
    this.tokens.set(key, { value: json.access_token, expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000 });
    return json.access_token;
  }

  /** Llamada autenticada. Devuelve el estado y el JSON tal cual (el llamador decide qué es error). */
  async call(grant: TokenGrant, method: 'GET' | 'POST', url: string, body?: unknown): Promise<RestResponse> {
    const token = await this.token(grant);
    const res = await this.raw(url, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) this.tokens.clear();
    return res;
  }

  private async raw(url: string, init: RequestInit): Promise<RestResponse> {
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
      throw new SunatUnavailable(aborted ? `SUNAT no respondió en ${this.timeoutMs / 1000} s` : 'No se pudo conectar con la API de SUNAT', { cause: e });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Mensaje de error de una respuesta REST de SUNAT ({ cod, msg, errors: [...] } o { message }). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function restError(json: any, status: number): string {
  const first = Array.isArray(json?.errors) ? json.errors[0] : null;
  return String(first?.desError ?? first?.msg ?? json?.msg ?? json?.message ?? `HTTP ${status}`).trim();
}
