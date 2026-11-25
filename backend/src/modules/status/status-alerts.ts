import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { emailLayout, escapeHtml, p } from '../notifications/email-layout';
import { Mailer } from '../notifications/mailer';
import type { CheckResult } from './probe';

/** Chequeos seguidos caídos para avisar: uno suelto puede ser un tropiezo de la red. */
export const CONFIRM_DOWNS = 2;
/** Cuánta historia se mira para saber desde cuándo está caído (1000 chequeos ≈ 7 días). */
const HISTORY = 1000;

/** Para los correos; los mismos nombres que COMPONENTS en frontend/src/lib/status.ts. */
const NAMES: Record<string, string> = {
  api: 'API REST y webhooks',
  'shalom-web': 'Shalom · Agencias y cotización',
  'shalom-tracking': 'Shalom · Rastreo de guías',
  'shalom-pro': 'Shalom · Creación de guías',
  'olva-tracking': 'Olva · Rastreo',
  'olva-web': 'Olva · Agencias y cotización',
  'sunat-cpe': 'SUNAT · Facturas, boletas y notas',
  'sunat-beta': 'SUNAT · Entorno de pruebas (beta)',
  'sunat-api': 'SUNAT · Guías de remisión, validez y SIRE',
  'sunat-padron': 'SUNAT · Consulta RUC y DNI',
  'sunat-exchange': 'SUNAT · Tipo de cambio',
};

const nameOf = (component: string) => NAMES[component] ?? component;

/** "25 nov., 00:10" en hora de Lima. */
const limaTime = (d: Date) =>
  new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

function duration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  return `${Math.floor(h / 24)} días y ${h % 24} h`;
}

/** El error completo (para el admin, no para la página pública), recortado. */
function internalError(err: unknown): string | null {
  if (err === undefined) return null;
  const text = err instanceof Error ? `${err.name === 'Error' ? '' : `${err.name}: `}${err.message}` : String(err);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

interface Down {
  component: string;
  since: Date;
  detail: string | null;
  error: string | null;
}

interface Recovery {
  component: string;
  since: Date;
  minutes: number;
}

export interface AlertsSummary {
  down: string[];
  recovered: string[];
}

/**
 * Alertas al admin desde la página de estado: un correo cuando un servicio lleva
 * CONFIRM_DOWNS chequeos seguidos caído y otro cuando vuelve. Cada caída se avisa
 * una vez (clave en `sent_emails` con el inicio de la caída); si Resend falla, se
 * reintenta en el siguiente chequeo.
 */
@Injectable()
export class StatusAlerts {
  private readonly logger = new Logger(StatusAlerts.name);

  constructor(
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
  ) {}

  /** `errors`: el último error de cada chequeo caído. Nunca lanza. */
  async notify(results: CheckResult[], errors: Map<string, unknown>, checkedAt: Date): Promise<AlertsSummary> {
    const summary: AlertsSummary = { down: [], recovered: [] };
    const to = this.config.email.adminEmails;
    if (!this.mailer.enabled || !this.prisma.enabled || !to.length) return summary;
    try {
      // El chequeo anterior de cada componente (corren cada 10 min).
      const previous = await this.prisma.statusCheck.findMany({
        where: { checkedAt: { lt: checkedAt, gte: new Date(checkedAt.getTime() - 30 * 60_000) } },
        orderBy: { checkedAt: 'desc' },
        select: { component: true, status: true },
      });
      const prev = new Map<string, string>();
      for (const row of previous) if (!prev.has(row.component)) prev.set(row.component, row.status);

      const downs: Down[] = [];
      const recoveries: Recovery[] = [];
      const claimed: string[] = [];
      for (const r of results) {
        const wasDown = prev.get(r.component) === 'down';
        if (r.status !== 'down' && !wasDown) continue;
        const { count, since } = await this.downStreak(r.component, checkedAt);
        if (r.status === 'down') {
          // Esta caída ya lleva CONFIRM_DOWNS chequeos (con el de ahora).
          if (count + 1 < CONFIRM_DOWNS) continue;
          const key = `status-down:${r.component}:${since!.toISOString()}`;
          if (!(await this.claim(key))) continue;
          claimed.push(key);
          downs.push({ component: r.component, since: since!, detail: r.detail, error: internalError(errors.get(r.component)) });
        } else if (since) {
          // Volvió: solo si se avisó la caída.
          const downKey = `status-down:${r.component}:${since.toISOString()}`;
          if (!(await this.prisma.sentEmail.findUnique({ where: { key: downKey } }))) continue;
          const key = `status-up:${r.component}:${since.toISOString()}`;
          if (!(await this.claim(key))) continue;
          claimed.push(key);
          recoveries.push({ component: r.component, since, minutes: Math.round((checkedAt.getTime() - since.getTime()) / 60_000) });
        }
      }

      const sent = await Promise.all([
        downs.length ? this.mailer.send({ to, ...this.downEmail(downs) }) : true,
        recoveries.length ? this.mailer.send({ to, ...this.recoveryEmail(recoveries) }) : true,
      ]);
      if (!sent[0]) await this.release(claimed.filter((k) => k.startsWith('status-down:')));
      if (!sent[1]) await this.release(claimed.filter((k) => k.startsWith('status-up:')));
      if (sent[0]) summary.down = downs.map((d) => d.component);
      if (sent[1]) summary.recovered = recoveries.map((d) => d.component);
    } catch (err) {
      this.logger.error(`Alertas de estado: ${String(err)}`);
    }
    return summary;
  }

  /** Chequeos caídos seguidos justo antes de `before`, y desde cuándo. */
  private async downStreak(component: string, before: Date): Promise<{ count: number; since: Date | null }> {
    const rows = await this.prisma.statusCheck.findMany({
      where: { component, checkedAt: { lt: before } },
      orderBy: { checkedAt: 'desc' },
      take: HISTORY,
      select: { status: true, checkedAt: true },
    });
    let count = 0;
    while (count < rows.length && rows[count].status === 'down') count++;
    return { count, since: count ? rows[count - 1].checkedAt : null };
  }

  private downEmail(downs: Down[]): { subject: string; html: string } {
    const subject = downs.length === 1 ? `🔴 Caído: ${nameOf(downs[0].component)}` : `🔴 ${downs.length} servicios caídos`;
    const items = downs
      .map(
        (d) =>
          `<li style="margin:0 0 10px"><b>${escapeHtml(nameOf(d.component))}</b> (<code>${escapeHtml(d.component)}</code>), caído desde las ${escapeHtml(limaTime(d.since))}.` +
          `<br>En la página: ${escapeHtml(d.detail ?? 'sin detalle')}` +
          (d.error ? `<br>Error: <code>${escapeHtml(d.error)}</code>` : '') +
          '</li>',
      )
      .join('');
    return {
      subject,
      html: emailLayout({
        title: subject.replace('🔴 ', ''),
        body:
          p(`No respondió en ${CONFIRM_DOWNS} chequeos seguidos de la página de estado (cada uno con un reintento):`) +
          `<ul style="margin:0 0 12px;padding-left:20px">${items}</ul>` +
          p('Los clientes que usan este servicio están recibiendo errores. Revisa los logs de Cloud Run; te aviso de nuevo cuando vuelva.', true),
        action: { label: 'Ver la página de estado', href: this.mailer.panelUrl('/status') },
      }),
    };
  }

  private recoveryEmail(recoveries: Recovery[]): { subject: string; html: string } {
    const subject = recoveries.length === 1 ? `✅ Volvió: ${nameOf(recoveries[0].component)}` : `✅ Volvieron ${recoveries.length} servicios`;
    const items = recoveries
      .map((r) => `<li style="margin:0 0 6px"><b>${escapeHtml(nameOf(r.component))}</b>: estuvo caído ${duration(r.minutes * 60_000)} (desde las ${escapeHtml(limaTime(r.since))}).</li>`)
      .join('');
    return {
      subject,
      html: emailLayout({
        title: subject.replace('✅ ', ''),
        body: p('El último chequeo de la página de estado ya responde:') + `<ul style="margin:0;padding-left:20px">${items}</ul>`,
        action: { label: 'Ver la página de estado', href: this.mailer.panelUrl('/status') },
      }),
    };
  }

  private async claim(key: string): Promise<boolean> {
    const { count } = await this.prisma.sentEmail.createMany({ data: [{ key }], skipDuplicates: true });
    return count === 1;
  }

  private async release(keys: string[]): Promise<void> {
    if (keys.length) await this.prisma.sentEmail.deleteMany({ where: { key: { in: keys } } });
  }
}
