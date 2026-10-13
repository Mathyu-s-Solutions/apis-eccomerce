import { XMLParser } from 'fast-xml-parser';
import { esc } from '../core/xml';

/** Entorno de SUNAT: beta (pruebas, no tiene validez) o producción. */
export type SunatEnvironment = 'beta' | 'produccion';

export const BILL_SERVICE_URL: Record<SunatEnvironment, string> = {
  beta: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  produccion: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
};
/** Consulta de CDR de un comprobante ya enviado (solo existe en producción). */
export const CONSULT_SERVICE_URL = 'https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService';

/** Usuario y clave SOL de pruebas que acepta el entorno beta con cualquier RUC. */
export const BETA_SOL = { user: 'MODDATOS', password: 'moddatos' } as const;

export interface SolCredentials {
  ruc: string;
  user: string;
  password: string;
}

/** SUNAT respondió con un error (SOAP Fault): el envío no quedó registrado. */
export class SunatFault extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SunatFault';
  }

  /**
   * Fallas de SUNAT (no del comprobante): caídas, tiempo de espera, servicio
   * saturado. El comprobante se puede reenviar tal cual.
   */
  get transient(): boolean {
    const n = Number(this.code);
    if (!Number.isFinite(n) || this.code === '') return true;
    // 0100-0140: errores internos del servicio; 0200-0250: del procesamiento por lotes.
    return (n >= 100 && n <= 140) || (n >= 200 && n <= 250);
  }
}

/** No hubo respuesta útil de SUNAT (red, timeout, HTML de error). */
export class SunatUnavailable extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SunatUnavailable';
  }
}

export interface TicketStatus {
  /** 0 = procesado, 98 = en proceso, 99 = procesado con errores. */
  statusCode: string;
  /** ZIP del CDR (cuando ya terminó). */
  content?: Buffer;
}

const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false });

function envelope(sol: SolCredentials, body: string): string {
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">' +
    `<soapenv:Header><wsse:Security><wsse:UsernameToken><wsse:Username>${esc(sol.ruc + sol.user)}</wsse:Username><wsse:Password>${esc(sol.password)}</wsse:Password></wsse:UsernameToken></wsse:Security></soapenv:Header>` +
    `<soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`
  );
}

export interface BillServiceOptions {
  timeoutMs?: number;
  /** Intentos cuando SUNAT corta la conexión sin responder SOAP. */
  attempts?: number;
  retryDelayMs?: number;
  fetch?: typeof fetch;
}

/** Respuestas sin SOAP que valen un reintento. */
const THROTTLED = new Set([401, 429, 502, 503, 504]);

/**
 * Cliente SOAP de los servicios de facturación de SUNAT (billService):
 * sendBill (síncrono), sendSummary + getStatus (por ticket) y getStatusCdr.
 */
export class BillServiceClient {
  private readonly timeoutMs: number;
  private readonly attempts: number;
  private readonly retryDelayMs: number;
  private readonly fetch: typeof fetch;

  constructor(opts: BillServiceOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.attempts = opts.attempts ?? 4;
    this.retryDelayMs = opts.retryDelayMs ?? 1200;
    this.fetch = opts.fetch ?? fetch;
  }

  /** Envía un comprobante (factura, boleta, nota). Devuelve el ZIP del CDR. */
  async sendBill(env: SunatEnvironment, sol: SolCredentials, fileName: string, zip: Uint8Array): Promise<Buffer> {
    const body = `<ser:sendBill><fileName>${esc(fileName)}</fileName><contentFile>${Buffer.from(zip).toString('base64')}</contentFile></ser:sendBill>`;
    const res = await this.call(BILL_SERVICE_URL[env], 'urn:sendBill', envelope(sol, body));
    const content = res?.sendBillResponse?.applicationResponse;
    if (!content) throw new SunatUnavailable('SUNAT respondió sin CDR a sendBill');
    return Buffer.from(String(content), 'base64');
  }

  /** Envía un resumen diario o una comunicación de baja. Devuelve el ticket. */
  async sendSummary(env: SunatEnvironment, sol: SolCredentials, fileName: string, zip: Uint8Array): Promise<string> {
    const body = `<ser:sendSummary><fileName>${esc(fileName)}</fileName><contentFile>${Buffer.from(zip).toString('base64')}</contentFile></ser:sendSummary>`;
    const res = await this.call(BILL_SERVICE_URL[env], 'urn:sendSummary', envelope(sol, body));
    const ticket = res?.sendSummaryResponse?.ticket;
    if (!ticket) throw new SunatUnavailable('SUNAT respondió sin ticket a sendSummary');
    return String(ticket);
  }

  /** Estado de un ticket de resumen o baja. */
  async getStatus(env: SunatEnvironment, sol: SolCredentials, ticket: string): Promise<TicketStatus> {
    const body = `<ser:getStatus><ticket>${esc(ticket)}</ticket></ser:getStatus>`;
    const res = await this.call(BILL_SERVICE_URL[env], 'urn:getStatus', envelope(sol, body));
    const status = res?.getStatusResponse?.status;
    if (!status) throw new SunatUnavailable('SUNAT respondió sin estado a getStatus');
    return {
      statusCode: String(status.statusCode ?? '').trim(),
      content: status.content ? Buffer.from(String(status.content), 'base64') : undefined,
    };
  }

  /** CDR de un comprobante ya recibido por SUNAT (solo producción). */
  async getStatusCdr(sol: SolCredentials, doc: { ruc: string; type: string; series: string; number: number }): Promise<{ statusCode: string; message: string; content?: Buffer }> {
    const body =
      '<ser:getStatusCdr>' +
      `<rucComprobante>${esc(doc.ruc)}</rucComprobante><tipoComprobante>${esc(doc.type)}</tipoComprobante>` +
      `<serieComprobante>${esc(doc.series)}</serieComprobante><numeroComprobante>${doc.number}</numeroComprobante>` +
      '</ser:getStatusCdr>';
    const res = await this.call(CONSULT_SERVICE_URL, 'urn:getStatusCdr', envelope(sol, body));
    const status = res?.getStatusCdrResponse?.statusCdr;
    if (!status) throw new SunatUnavailable('SUNAT respondió sin estado a getStatusCdr');
    return {
      statusCode: String(status.statusCode ?? '').trim(),
      message: String(status.statusMessage ?? '').trim(),
      content: status.content ? Buffer.from(String(status.content), 'base64') : undefined,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async call(url: string, action: string, xml: string): Promise<any> {
    for (let attempt = 1; ; attempt++) {
      const { status, text } = await this.post(url, action, xml);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let body: any;
      try {
        body = parser.parse(text)?.Envelope?.Body;
      } catch {
        body = undefined;
      }
      if (body?.Fault) throw toFault(body.Fault);
      if (body) return body;
      // Sin mensaje SOAP: el balanceador de SUNAT corta las ráfagas con un 401/503 en HTML.
      if (THROTTLED.has(status) && attempt < this.attempts) {
        await new Promise((r) => setTimeout(r, this.retryDelayMs * attempt));
        continue;
      }
      throw new SunatUnavailable(`SUNAT respondió HTTP ${status} sin un mensaje SOAP`);
    }
  }

  private async post(url: string, action: string, xml: string): Promise<{ status: number; text: string }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'text/xml; charset=utf-8', soapaction: action },
        body: xml,
        signal: ac.signal,
      });
      return { status: res.status, text: await res.text() };
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      throw new SunatUnavailable(aborted ? `SUNAT no respondió en ${this.timeoutMs / 1000} s` : 'No se pudo conectar con SUNAT', { cause: e });
    } finally {
      clearTimeout(timer);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFault(fault: any): SunatFault {
  const faultcode = String(fault.faultcode ?? '');
  const faultstring = String(fault.faultstring ?? '').trim();
  const detail = typeof fault.detail === 'object' ? String(fault.detail?.message ?? '').trim() : String(fault.detail ?? '').trim();
  // El código viene en faultcode ("soap-env:Client.0111") o como faultstring ("0306").
  const code = /(\d{3,4})\s*$/.exec(faultcode)?.[1] ?? /^\s*(\d{3,4})\b/.exec(faultstring)?.[1] ?? '';
  const message = /^\d{3,4}$/.test(faultstring) ? detail || faultstring : faultstring;
  return new SunatFault(code.padStart(4, '0').replace(/^0000$/, ''), message || 'SUNAT rechazó el envío');
}
