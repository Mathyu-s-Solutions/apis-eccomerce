import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { ShalomWebClient } from '../shalom/shalom-web.client';
import { ShalomService, type LookupBy } from '../shalom/shalom.service';
import { BCRP } from '../sunat/consultas/exchange-rate.service';
import { PadronService } from '../sunat/consultas/padron.service';
import { limaNow } from '../sunat/core/time';
import { BILL_SERVICE_URL } from '../sunat/transport/bill-service';
import { SCOPES, SECURITY } from '../sunat/transport/sunat-rest';
import { ProbeError, runProbe, type CheckResult, type Probe } from './probe';
import { StatusAlerts, type AlertsSummary } from './status-alerts';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/** Días de historial de la página (y uno más, para que el primer día del gráfico esté completo). */
const RETENTION_DAYS = 91;
/** RUC de la propia SUNAT: siempre está en el padrón. */
const PROBE_RUC = '20131312955';
/** Un padrón más viejo que esto: SUNAT no publicó uno nuevo o falló el workflow padron-ruc. */
const PADRON_MAX_AGE_DAYS = 7;
const NIL_CLIENT = '00000000-0000-0000-0000-000000000000';
/** Sin ninguna guía conocida, se busca una que no existe (prueba el captcha y la búsqueda). */
const NO_GUIDE: LookupBy = { orderNumber: '99999999', orderCode: 'ZZZZ' };

export type StatusSummary =
  | { skipped: 'sin base de datos' }
  | { failed: true }
  | { checked: number; down: string[]; degraded: string[]; alerts: AlertsSummary };

function get(url: string | URL, signal: AbortSignal, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, { signal, headers: { 'user-agent': UA, ...headers } });
}

function expectOk(res: Response): void {
  if (!res.ok) throw new ProbeError(`HTTP ${res.status}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json().catch(() => null);
}

/** El WSDL del servicio SOAP de comprobantes: si lo entrega, el servicio está arriba. */
async function wsdl(url: string, signal: AbortSignal): Promise<void> {
  const res = await get(`${url}?wsdl`, signal);
  expectOk(res);
  if (!(await res.text()).includes('definitions')) throw new ProbeError('Respuesta inesperada');
}

const shiftDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Página de estado del portal: cada 10 minutos (desde el worker) prueba la API y cada servicio
 * del que depende con una consulta real y liviana, sin captcha ni cuota, y guarda el resultado
 * en `status_checks` (90 días). El portal lee esa tabla directo de la base, así la página sigue
 * respondiendo aunque la API esté caída.
 */
@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);

  constructor(
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly shalomWeb: ShalomWebClient,
    private readonly shalom: ShalomService,
    private readonly padron: PadronService,
    private readonly alerts: StatusAlerts,
  ) {}

  /** Corre todos los chequeos, los guarda y avisa al admin si algo se cayó o volvió. Nunca lanza. */
  async runChecks(): Promise<StatusSummary> {
    if (!this.prisma.enabled) return { skipped: 'sin base de datos' };
    try {
      const checkedAt = new Date();
      // El último error de cada chequeo: va en la alerta al admin, nunca a la página.
      const errors = new Map<string, unknown>();
      const results = await Promise.all(
        this.probes().map((p) =>
          runProbe(p, {
            onError: (probe, err) => {
              errors.set(probe.id, err);
              this.logger.warn(`Chequeo de estado ${probe.id} falló: ${String(err)}`);
            },
          }),
        ),
      );
      await this.prisma.statusCheck.createMany({ data: results.map((r) => ({ ...r, checkedAt })), skipDuplicates: true });
      await this.prisma.statusCheck.deleteMany({ where: { checkedAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) } } });
      const alerts = await this.alerts.notify(results, errors, checkedAt);
      const ids = (status: CheckResult['status']) => results.filter((r) => r.status === status).map((r) => r.component);
      return { checked: results.length, down: ids('down'), degraded: ids('degraded'), alerts };
    } catch (e) {
      this.logger.error(`No se pudieron guardar los chequeos de estado: ${String(e)}`);
      return { failed: true };
    }
  }

  /** Los ids deben coincidir con COMPONENTS de frontend/src/lib/status.ts. */
  probes(): Probe[] {
    const { olva, shalom } = this.config;
    const probes: Probe[] = [
      {
        // El worker corre dentro de la API: si este chequeo se guarda, la API y la base responden.
        id: 'api',
        slowMs: 2_000,
        run: async () => {
          await this.prisma.$queryRaw`SELECT 1`;
        },
      },
      {
        // Abre sesión en shalom.com.pe y pide la versión del catálogo de agencias: el mismo
        // proxy cifrado que usan el rastreo, las agencias y la cotización (sin captcha).
        id: 'shalom-web',
        run: async () => {
          await this.shalomWeb.post('agencias/version', {});
        },
      },
      {
        // El primer paso del login de Shalom Pro (Laravel Sanctum), sin credenciales.
        id: 'shalom-pro',
        run: async (signal) => expectOk(await get(`${shalom.proBase.replace(/\/+$/, '')}/sanctum/csrf-cookie`, signal)),
      },
      {
        // Una guía que no existe: si el servicio y la apikey pública funcionan, Olva responde
        // 404 "Información no encontrada" (con una apikey vencida sería 403).
        id: 'olva-tracking',
        run: async (signal) => {
          const url = new URL(`${olva.trackingBase}/webservice/rest/getTrackingInformation`);
          url.search = new URLSearchParams({ tracking: '1', emision: '26', apikey: olva.trackingApiKey, details: '1' }).toString();
          const res = await get(url, signal, { origin: 'https://tracking.olvaexpress.pe', referer: 'https://tracking.olvaexpress.pe/' });
          const body = await json(res);
          if (res.status === 200 || (res.status === 404 && Number(body?.code) === 404)) return;
          throw new ProbeError(`HTTP ${res.status}`);
        },
      },
      {
        // Cotiza un sobre Lima → Lima en el WordPress de olvacourier.com (el mismo de las agencias).
        id: 'olva-web',
        slowMs: 8_000,
        run: async (signal) => {
          const form = new FormData();
          const fields = { action: 'olva_calculate_shipping', partner_rate: 'false', ubigeo_code_origin: '150101', ubigeo_code_destiny: '150101', delivery_type: 'D', shipment_type: '1', weight: '0.5', length: '', width: '', height: '' };
          for (const [k, v] of Object.entries(fields)) form.append(k, v);
          const res = await fetch(`${olva.wpBase}/wp-admin/admin-ajax.php`, {
            method: 'POST',
            body: form,
            signal,
            headers: { 'user-agent': UA, origin: olva.wpBase, referer: `${olva.wpBase}/cotizar/`, accept: 'application/json, text/plain, */*' },
          });
          expectOk(res);
          const body = await json(res);
          if (body?.success !== true || !body?.data?.amount) throw new ProbeError('Respuesta inesperada');
        },
      },
      { id: 'sunat-cpe', run: (signal) => wsdl(BILL_SERVICE_URL.produccion, signal) },
      { id: 'sunat-beta', run: (signal) => wsdl(BILL_SERVICE_URL.beta, signal) },
      {
        // Servidor de tokens de las APIs REST (guías, validez, SIRE): a un cliente que no existe
        // le responde 400 con `error`. Un 5xx o algo que no es JSON es una caída.
        id: 'sunat-api',
        run: async (signal) => {
          const res = await fetch(`${SECURITY}/clientesextranet/${NIL_CLIENT}/oauth2/token/`, {
            method: 'POST',
            signal,
            headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPES.contribuyentes, client_id: NIL_CLIENT, client_secret: 'status' }).toString(),
          });
          if (res.status >= 500) throw new ProbeError(`HTTP ${res.status}`);
          if (typeof (await json(res))?.error !== 'string') throw new ProbeError('Respuesta inesperada');
        },
      },
      {
        // La serie del dólar SBS de los últimos 10 días en la API del BCRP.
        id: 'sunat-exchange',
        run: async (signal) => {
          const today = limaNow().date;
          // Sin un User-Agent de navegador, su PHP pega una traza de error después del JSON.
          const res = await get(`${BCRP}/PD04640PD/json/${shiftDays(today, -10)}/${today}`, signal, { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; MathyuAPIs/1.0)' });
          expectOk(res);
          const text = await res.text();
          const extra = text.search(/<[a-z!]/i);
          if (extra === 0) throw new ProbeError('Respondió HTML en vez de JSON');
          const periods = (JSON.parse(extra > 0 ? text.slice(0, extra) : text) as { periods?: unknown }).periods;
          if (!Array.isArray(periods)) throw new ProbeError('Respuesta inesperada');
        },
      },
    ];

    if (shalom.captchaProvider !== 'none') {
      probes.push({
        // El rastreo completo de una guía real (captcha, rastrea/buscar y rastrea/estados en la
        // misma sesión), sin cachés. shalom-web solo prueba la sesión: siguió en verde los días
        // de nov-2026 en que Shalom cambió el rastreo y fallaban todas las guías.
        id: 'shalom-tracking',
        // En una instancia nueva, la primera vez abre Chromium para el captcha.
        timeoutMs: 45_000,
        slowMs: 30_000,
        run: async () => {
          const guide = await this.trackingGuide();
          const found = await this.shalom.probe(guide ?? NO_GUIDE);
          if (guide && !found) throw new ProbeError('No encontró una guía que existe');
        },
      });
    }

    if (this.config.sunat.padronUrl) {
      probes.push({
        id: 'sunat-padron',
        run: async () => {
          if (!(await this.padron.ruc(PROBE_RUC))) throw new ProbeError('No encontró un RUC conocido');
          // Un RUC al azar lee un bloque que casi nunca está en memoria: prueba la lectura del bucket.
          await this.padron.ruc(`20${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`);
          const { version } = await this.padron.info();
          const ageDays = (Date.parse(`${limaNow().date}T12:00:00Z`) - Date.parse(`${version}T12:00:00Z`)) / 86_400_000;
          if (ageDays > PADRON_MAX_AGE_DAYS) return { degraded: `Padrón de SUNAT al ${version}` };
        },
      });
    }
    return probes;
  }

  /**
   * La guía con la que se prueba el rastreo de Shalom: SHALOM_STATUS_GUIDE o, sin ella, la
   * última que alguien rastreó en los últimos 30 días (solo su ose_id; de ella no se guarda
   * ni se muestra nada).
   */
  private async trackingGuide(): Promise<LookupBy | null> {
    const configured = this.config.shalom.statusGuide;
    if (configured) {
      const [number, code] = configured.split(':');
      return code ? { orderNumber: number, orderCode: code } : { oseId: number };
    }
    const row = await this.prisma.shalomGuide.findFirst({
      where: { lastUsedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      orderBy: { lastUsedAt: 'desc' },
      select: { oseId: true },
    });
    return row ? { oseId: row.oseId } : null;
  }
}
