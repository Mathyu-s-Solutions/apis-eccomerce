import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { currentPeriod } from '../../auth/api-key.store';
import { FREE_MONTHLY_LIMIT } from '../../auth/plan-quota';
import { PRODUCTS, type Product } from '../../auth/product.decorator';
import type { CertificateInfo } from '../sunat/signing/certificate';
import { MAX_ATTEMPTS, RETRY_DELAYS_MS } from '../webhooks/webhooks.service';
import { emailLayout, escapeHtml, limaDate, limaDay, p } from './email-layout';
import { type Email, Mailer } from './mailer';

const DAY_MS = 86_400_000;

/** Avisos de cuota: al pasar el 80% y al agotarla. */
const QUOTA_THRESHOLDS = [80, 100];
/** Avisos del certificado de SUNAT: días antes de que venza (0 = ya venció). */
const CERT_THRESHOLDS = [30, 7, 0];

const PRODUCT_NAME: Record<Product, string> = { shalom: 'Shalom', olva: 'Olva', sunat: 'SUNAT' };
const UNITS: Record<Product, string> = { shalom: 'consultas', olva: 'consultas', sunat: 'operaciones' };

const isProduct = (v: string): v is Product => (PRODUCTS as readonly string[]).includes(v);
const hello = (name: string | null) => p(`Hola${name ? ` ${escapeHtml(name)}` : ''},`);

export interface NotificationsResult {
  quota: number;
  webhooks: number;
  certificates: number;
}

/**
 * Avisos por correo que salen del worker (cron cada 10 min): cuota casi agotada,
 * webhook que dejó de recibir y certificado digital de SUNAT por vencer. Cada
 * aviso se anota en `sent_emails` antes de enviarse (así dos ticks a la vez no
 * lo duplican) y se libera si Resend falla, para reintentarlo en el siguiente.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
  ) {}

  async runDue(now = new Date()): Promise<NotificationsResult | { skipped: true }> {
    if (!this.mailer.enabled || !this.prisma.enabled) return { skipped: true };
    return {
      quota: await this.safely('cuota', () => this.quota(now)),
      webhooks: await this.safely('webhooks', () => this.deadWebhooks(now)),
      certificates: await this.safely('certificados', () => this.certificates(now)),
    };
  }

  /** Un tipo de aviso que falla no frena a los demás. -1 = falló. */
  private async safely(label: string, run: () => Promise<number>): Promise<number> {
    try {
      return await run();
    } catch (err) {
      this.logger.error(`Avisos de ${label}: ${String(err)}`);
      return -1;
    }
  }

  /** Cuota del mes al 80% y al 100%, en los planes que tienen límite. */
  async quota(now: Date): Promise<number> {
    const period = currentPeriod(now);
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const minLimit = Math.min(...Object.values(FREE_MONTHLY_LIMIT));
    const rows = await this.prisma.planUsage.findMany({
      where: { period, used: { gte: Math.ceil((minLimit * QUOTA_THRESHOLDS[0]) / 100) } },
      include: { user: { select: { email: true, name: true, subscriptions: true } } },
    });

    let sent = 0;
    for (const row of rows) {
      if (!isProduct(row.product)) continue;
      const product = row.product;
      const sub = row.user.subscriptions.find((s) => s.product === product);
      const active = !!sub && (!sub.expiresAt || sub.expiresAt > now);
      // Su plan pagado venció este mes: lo que gastó fue de ese plan, y ya le avisamos que venció.
      if (sub && !active && sub.plan !== 'free' && sub.expiresAt && sub.expiresAt >= periodStart) continue;
      const limit = active ? sub.monthlyLimit : FREE_MONTHLY_LIMIT[product];
      if (limit === null || limit <= 0) continue;

      const reached = QUOTA_THRESHOLDS.filter((t) => row.used * 100 >= limit * t);
      if (!reached.length) continue;
      // Si pasó el 80% y el 100% entre dos ticks, solo va el del 100%.
      const keys = reached.map((t) => `quota:${row.userId}:${product}:${period}:${t}`);
      const email = this.quotaEmail(row.user, product, row.used, limit, !active, reached.at(-1)!);
      if (await this.sendOnce(keys, email)) sent++;
    }
    return sent;
  }

  private quotaEmail(user: { email: string; name: string | null }, product: Product, used: number, limit: number, free: boolean, threshold: number): Email {
    const name = PRODUCT_NAME[product];
    const units = UNITS[product];
    const plan = free ? 'el plan gratis' : 'tu plan';
    const upgrade = this.mailer.panelUrl(`/dashboard/billing?product=${product}`);
    if (threshold >= 100) {
      return {
        to: user.email,
        subject: `Llegaste al límite de tu cuota de ${name}`,
        html: emailLayout({
          title: 'Se acabó tu cuota del mes',
          body:
            hello(user.name) +
            p(`Usaste las <b>${limit} ${units}</b> de este mes en <b>${name}</b> (${plan}). Desde ahora la API responde <b>429 (cuota agotada)</b> a tus keys hasta que el contador se reinicie con el mes nuevo.`) +
            p('Para seguir sin esperar, mejora tu plan con Yape o Plin: apenas validemos el pago, se activa la cuota nueva.', true),
          action: { label: 'Mejorar mi plan', href: upgrade },
        }),
      };
    }
    return {
      to: user.email,
      subject: `Usaste el ${threshold}% de tu cuota de ${name} este mes`,
      html: emailLayout({
        title: 'Te queda poca cuota este mes',
        body:
          hello(user.name) +
          p(`Este mes llevas <b>${used} de ${limit} ${units}</b> en <b>${name}</b> (${plan}).`) +
          p('Cuando llegues al límite, la API responderá 429 (cuota agotada) hasta que el contador se reinicie con el mes nuevo. Si lo vas a necesitar, mejora tu plan antes.', true),
        action: { label: 'Ver planes', href: upgrade },
      }),
    };
  }

  /**
   * Entregas de webhook que agotaron sus reintentos. Cada entrega se avisa una
   * vez, y a lo más un correo al día por cliente aunque sigan cayendo.
   */
  async deadWebhooks(now: Date): Promise<number> {
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: {
        status: 'dead',
        attempts: { gte: MAX_ATTEMPTS },
        event: { not: 'webhook.test' },
        createdAt: { gte: new Date(now.getTime() - 2 * DAY_MS) },
      },
      select: { id: true, userId: true, lastStatus: true, lastError: true },
      orderBy: { createdAt: 'desc' },
    });
    const keyOf = (id: string) => `webhook-dead:${id}`;
    const done = new Set(
      (await this.prisma.sentEmail.findMany({ where: { key: { in: deliveries.map((d) => keyOf(d.id)) } } })).map((s) => s.key),
    );
    const byUser = new Map<string, typeof deliveries>();
    for (const d of deliveries) {
      if (!done.has(keyOf(d.id))) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d]);
    }
    if (!byUser.size) return 0;

    const hooks = await this.prisma.webhook.findMany({
      where: { userId: { in: [...byUser.keys()] }, enabled: true },
      include: { user: { select: { email: true, name: true } } },
    });

    let sent = 0;
    for (const hook of hooks) {
      const failed = byUser.get(hook.userId)!;
      const fresh = await this.claim(failed.map((d) => keyOf(d.id)));
      if (!fresh.length) continue;
      // Ya le escribimos hoy: estas entregas quedan contadas, sin otro correo.
      const today = await this.claim([`webhook-dead:${hook.userId}:${limaDay(now)}`]);
      if (!today.length) continue;

      const last = failed[0];
      const hours = Math.round(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) / 3_600_000);
      const count = fresh.length === 1 ? '1 aviso' : `${fresh.length} avisos`;
      const email: Email = {
        to: hook.user.email,
        subject: 'Tu webhook no está recibiendo los avisos',
        html: emailLayout({
          title: 'Tu webhook no responde',
          body:
            hello(hook.user.name) +
            p(`No pudimos entregar <b>${count}</b> a tu webhook <b>${escapeHtml(hook.url)}</b>: lo intentamos ${MAX_ATTEMPTS} veces durante unas ${hours} horas y no respondió con un 2xx.`) +
            p(`Último error: ${escapeHtml(last.lastError ?? 'sin respuesta')}${last.lastStatus ? ` (HTTP ${last.lastStatus})` : ''}.`) +
            p('Revisa que la URL esté en línea y responda 2xx en menos de 10 segundos. Cuando lo arregles, recupera los avisos perdidos: están en <code>GET /v1/webhooks/deliveries</code> y cada uno se reenvía con <code>POST /v1/webhooks/deliveries/{id}/redeliver</code>.', true),
        }),
      };
      if (await this.mailer.send(email)) sent++;
      else await this.release([...fresh, ...today]);
    }
    return sent;
  }

  /** Certificado digital de SUNAT: 30 y 7 días antes de vencer, y cuando vence. */
  async certificates(now: Date): Promise<number> {
    const companies = await this.prisma.sunatCompany.findMany({
      where: { certificate: { not: null } },
      select: { id: true, ruc: true, razonSocial: true, certificateInfo: true, user: { select: { email: true, name: true } } },
    });

    let sent = 0;
    for (const c of companies) {
      const info = c.certificateInfo as unknown as CertificateInfo | null;
      if (!info?.validTo) continue;
      const validTo = new Date(info.validTo);
      const daysLeft = (validTo.getTime() - now.getTime()) / DAY_MS;
      if (daysLeft < -7) continue; // venció hace rato: ya no es noticia
      const reached = CERT_THRESHOLDS.filter((t) => daysLeft <= t);
      if (!reached.length) continue;

      const keys = reached.map((t) => `sunat-cert:${c.id}:${info.validTo}:${t}`);
      if (await this.sendOnce(keys, this.certificateEmail(c, validTo, Math.ceil(daysLeft)))) sent++;
    }
    return sent;
  }

  private certificateEmail(
    c: { ruc: string; razonSocial: string; user: { email: string; name: string | null } },
    validTo: Date,
    daysLeft: number,
  ): Email {
    const company = `<b>${escapeHtml(c.razonSocial)}</b> (RUC ${escapeHtml(c.ruc)})`;
    const action = { label: 'Subir el nuevo certificado', href: this.mailer.panelUrl('/dashboard/sunat') };
    if (daysLeft <= 0) {
      return {
        to: c.user.email,
        subject: `Venció el certificado digital de ${c.razonSocial}`,
        html: emailLayout({
          title: 'Tu certificado digital venció',
          body:
            hello(c.user.name) +
            p(`El certificado digital de ${company} venció el <b>${limaDate(validTo)}</b>. Desde entonces la API no puede firmar ni enviar sus comprobantes a SUNAT.`) +
            p('Sube el certificado nuevo en tu panel para volver a emitir.', true),
          action,
        }),
      };
    }
    const when = daysLeft === 1 ? 'mañana' : `en ${daysLeft} días`;
    return {
      to: c.user.email,
      subject: `El certificado digital de ${c.razonSocial} vence el ${limaDate(validTo)}`,
      html: emailLayout({
        title: 'Tu certificado digital vence pronto',
        body:
          hello(c.user.name) +
          p(`El certificado digital con el que firmamos los comprobantes de ${company} vence el <b>${limaDate(validTo)}</b> (${when}).`) +
          p('Cuando venza no podremos firmar ni enviar sus comprobantes a SUNAT. Pide la renovación a la entidad que te lo emitió (puede tardar unos días) y sube el nuevo en tu panel.', true),
        action,
      }),
    };
  }

  /**
   * Manda `email` si el último de `keys` (el aviso más urgente) es nuevo. Los
   * anteriores se anotan igual: si pasó el 80% y el 100% juntos, solo va uno.
   */
  private async sendOnce(keys: string[], email: Email): Promise<boolean> {
    const fresh = await this.claim(keys);
    if (!fresh.includes(keys.at(-1)!)) return false;
    if (await this.mailer.send(email)) return true;
    await this.release(fresh);
    return false;
  }

  /** Anota las claves que nadie anotó antes (ON CONFLICT DO NOTHING) y devuelve esas. */
  private async claim(keys: string[]): Promise<string[]> {
    const fresh: string[] = [];
    for (const key of keys) {
      const { count } = await this.prisma.sentEmail.createMany({ data: [{ key }], skipDuplicates: true });
      if (count === 1) fresh.push(key);
    }
    return fresh;
  }

  private async release(keys: string[]): Promise<void> {
    await this.prisma.sentEmail.deleteMany({ where: { key: { in: keys } } });
  }
}
