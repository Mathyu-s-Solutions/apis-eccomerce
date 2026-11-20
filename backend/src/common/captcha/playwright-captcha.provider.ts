import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from 'playwright';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { UpstreamError } from '../errors/upstream.error';
import { CaptchaProvider, type CaptchaSite } from './captcha.provider';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

interface Slot {
  page: Page;
  site: CaptchaSite;
  navigatedAt: number;
  busy: boolean;
}

/** Dónde se resuelve cada sitio y con qué variante de reCAPTCHA. */
interface SiteSpec {
  url: string;
  siteKey: string;
  enterprise: boolean;
}

/**
 * Resuelve reCAPTCHA con un navegador headless.
 *
 * Por qué así: el token está atado al dominio registrado del site key. Generarlo
 * en localhost haría que el upstream lo rechace. Cargamos una página real del
 * sitio y ejecutamos `grecaptcha.execute(key, { action })` (o
 * `grecaptcha.enterprise.execute` en Olva), igual que su front.
 * Validado en scripts/probes/captcha-probe.mjs.
 *
 * - web: pool de páginas calientes sobre shalom.com.pe/rastrea (rastreo y tarifas).
 * - pro: pro.shalom.pe/login (login de Shalom Pro), una página que se abre al primer uso.
 * - olva: registrodeenvios.olvacourier.com (reCAPTCHA Enterprise), una página que se
 *   abre al primer uso; su front carga el script Enterprise recién al usarlo, así que
 *   si no está lo inyectamos.
 *
 * Re-navega cada pageTtlMs y relanza el navegador si Chromium se cae.
 */
@Injectable()
export class PlaywrightCaptchaProvider
  extends CaptchaProvider
  implements OnModuleDestroy
{
  private readonly logger = new Logger(PlaywrightCaptchaProvider.name);
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private slots: Slot[] = [];
  private launching: Promise<void> | null = null;

  constructor(@Inject(CONFIG_TOKEN) private readonly config: AppConfig) {
    super();
  }

  private spec(site: CaptchaSite): SiteSpec {
    const { shalom, olva } = this.config;
    if (site === 'pro') return { url: `${shalom.proBase}/login`, siteKey: shalom.recaptchaSiteKey, enterprise: false };
    if (site === 'olva') return { url: `${olva.registroWeb.replace(/\/+$/, '')}/`, siteKey: olva.recaptchaSiteKey, enterprise: true };
    return { url: `${shalom.webBase}/rastrea`, siteKey: shalom.recaptchaSiteKey, enterprise: false };
  }

  async getToken(action: string, site: CaptchaSite = 'web'): Promise<string> {
    try {
      return await this.generate(action, site);
    } catch (err) {
      // Un reintento tras relanzar: cubre browser caído o página muerta.
      this.logger.warn(`Captcha falló (${site}/${action}), relanzo y reintento: ${String(err)}`);
      await this.teardown();
      try {
        return await this.generate(action, site);
      } catch (err2) {
        throw new UpstreamError(site === 'olva' ? 'olva-captcha' : 'shalom-captcha', `No se pudo generar el token reCAPTCHA (${action})`, {
          status: 502,
          cause: err2,
        });
      }
    }
  }

  private async generate(action: string, site: CaptchaSite): Promise<string> {
    await this.ensureBrowser();
    const slot = await this.acquireSlot(site);
    try {
      await this.ensureFresh(slot);
      const { siteKey, enterprise } = this.spec(site);
      const token = await slot.page.evaluate(
        ({ action, fallback, enterprise, timeoutMs }) =>
          new Promise<string>((resolve, reject) => {
            type Grecaptcha = {
              ready: (cb: () => void) => void;
              execute: (key: string, opts: { action: string }) => Promise<string>;
            };
            const w = globalThis as unknown as {
              grecaptcha?: Grecaptcha & { enterprise?: Grecaptcha };
              RECAPTCHA_SITE_KEY?: string;
            };
            const key = (!enterprise && w.RECAPTCHA_SITE_KEY) || fallback;
            const client = enterprise ? w.grecaptcha?.enterprise : w.grecaptcha;
            if (!client) return reject(new Error('grecaptcha no cargó'));
            const timer = setTimeout(() => reject(new Error('timeout grecaptcha')), timeoutMs);
            client.ready(() => {
              client
                .execute(key, { action })
                .then((t) => {
                  clearTimeout(timer);
                  resolve(t);
                })
                .catch((e) => {
                  clearTimeout(timer);
                  reject(e);
                });
            });
          }),
        {
          action,
          fallback: siteKey,
          enterprise,
          timeoutMs: this.config.shalom.captcha.tokenTimeoutMs,
        },
      );
      if (!token) throw new Error('token vacío');
      return token;
    } finally {
      slot.busy = false;
    }
  }

  private async ensureBrowser(): Promise<void> {
    if (this.browser?.isConnected() && this.slots.length) return;
    if (this.launching) return this.launching;
    this.launching = this.launch().finally(() => {
      this.launching = null;
    });
    return this.launching;
  }

  private async launch(): Promise<void> {
    const { captcha } = this.config.shalom;
    this.logger.log(`Lanzando Chromium (headless=${captcha.headless}, pool=${captcha.poolSize})`);
    this.browser = await chromium.launch({
      headless: captcha.headless,
      // En contenedores /dev/shm es chico; Chromium usa /tmp en su lugar.
      args: ['--disable-dev-shm-usage'],
    });
    this.context = await this.browser.newContext({ userAgent: UA, locale: 'es-PE' });
    this.slots = [];
    for (let i = 0; i < captcha.poolSize; i++) {
      const page = await this.context.newPage();
      await this.navigate(page, 'web');
      this.slots.push({ page, site: 'web', navigatedAt: Date.now(), busy: false });
    }
  }

  private async navigate(page: Page, site: CaptchaSite): Promise<void> {
    const { navTimeoutMs } = this.config.shalom.captcha;
    const { url, siteKey, enterprise } = this.spec(site);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs });
    if (enterprise) {
      // Su front agrega el script Enterprise recién en la primera acción: lo cargamos nosotros.
      await page.evaluate((key) => {
        // Sin tipos del DOM en el backend: lo mínimo que se usa de `document`.
        type El = { id: string; src: string; async: boolean };
        const w = globalThis as unknown as {
          grecaptcha?: { enterprise?: unknown };
          document: { getElementById(id: string): unknown; createElement(tag: string): El; head: { appendChild(el: El): void } };
        };
        if (w.grecaptcha?.enterprise || w.document.getElementById('google-recaptcha-enterprise')) return;
        const script = w.document.createElement('script');
        script.id = 'google-recaptcha-enterprise';
        script.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(key)}`;
        script.async = true;
        w.document.head.appendChild(script);
      }, siteKey);
    }
    await page
      .waitForFunction(
        (enterprise) => {
          const g = (globalThis as unknown as { grecaptcha?: { enterprise?: unknown } }).grecaptcha;
          return enterprise ? !!g?.enterprise : !!g;
        },
        enterprise,
        { timeout: navTimeoutMs },
      )
      .catch(() => {
        throw new Error(`grecaptcha no apareció tras navegar a ${url}`);
      });
  }

  private async ensureFresh(slot: Slot): Promise<void> {
    const stale = Date.now() - slot.navigatedAt > this.config.shalom.captcha.pageTtlMs;
    if (stale || slot.page.isClosed()) {
      await this.navigate(slot.page, slot.site);
      slot.navigatedAt = Date.now();
    }
  }

  /** Semáforo simple: espera a que se libere un slot del pool de ese sitio. */
  private async acquireSlot(site: CaptchaSite): Promise<Slot> {
    const deadline = Date.now() + this.config.shalom.captcha.tokenTimeoutMs + 5000;
    for (;;) {
      const free = this.slots.find((s) => s.site === site && !s.busy);
      if (free) {
        free.busy = true;
        return free;
      }
      // Las páginas de pro y olva se abren la primera vez (navigatedAt 0: ensureFresh navega).
      if (site !== 'web' && this.context && !this.slots.some((s) => s.site === site)) {
        const slot: Slot = { page: await this.context.newPage(), site, navigatedAt: 0, busy: true };
        this.slots.push(slot);
        return slot;
      }
      if (Date.now() > deadline) {
        throw new UpstreamError(site === 'olva' ? 'olva-captcha' : 'shalom-captcha', 'Todas las páginas del pool están ocupadas', {
          status: 503,
        });
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  private async teardown(): Promise<void> {
    const b = this.browser;
    this.browser = null;
    this.context = null;
    this.slots = [];
    try {
      await b?.close();
    } catch {
      /* ignore */
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.teardown();
  }
}
