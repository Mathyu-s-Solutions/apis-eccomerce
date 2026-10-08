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
import { CONFIG_TOKEN, type AppConfig } from '../../../config/configuration';
import { UpstreamError } from '../../../common/errors/upstream.error';
import { CaptchaProvider } from './captcha.provider';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

interface Slot {
  page: Page;
  navigatedAt: number;
  busy: boolean;
}

/**
 * Resuelve reCAPTCHA v3 de Shalom con un navegador headless.
 *
 * Por qué así: el token v3 está atado al dominio registrado del site key
 * (shalom.com.pe). Generarlo en localhost haría que Shalom lo rechace. Cargamos
 * una página real de Shalom (que ya trae grecaptcha + RECAPTCHA_SITE_KEY) y
 * ejecutamos `grecaptcha.execute(key, { action })`, igual que su front.
 * Validado en scripts/probes/captcha-probe.mjs.
 *
 * Mantiene un pool de páginas calientes sobre /rastrea; re-navega cada pageTtlMs
 * y relanza el navegador si Chromium se cae.
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

  async getToken(action: string): Promise<string> {
    try {
      return await this.generate(action);
    } catch (err) {
      // Un reintento tras relanzar: cubre browser caído o página muerta.
      this.logger.warn(`Captcha falló (${action}), relanzo y reintento: ${String(err)}`);
      await this.teardown();
      try {
        return await this.generate(action);
      } catch (err2) {
        throw new UpstreamError('shalom-captcha', `No se pudo generar el token reCAPTCHA (${action})`, {
          status: 502,
          cause: err2,
        });
      }
    }
  }

  private async generate(action: string): Promise<string> {
    await this.ensureBrowser();
    const slot = await this.acquireSlot();
    try {
      await this.ensureFresh(slot);
      const token = await slot.page.evaluate(
        ({ action, fallback, timeoutMs }) =>
          new Promise<string>((resolve, reject) => {
            const w = globalThis as unknown as {
              grecaptcha?: {
                ready: (cb: () => void) => void;
                execute: (key: string, opts: { action: string }) => Promise<string>;
              };
              RECAPTCHA_SITE_KEY?: string;
            };
            const key = w.RECAPTCHA_SITE_KEY || fallback;
            if (!w.grecaptcha) return reject(new Error('grecaptcha no cargó'));
            const timer = setTimeout(() => reject(new Error('timeout grecaptcha')), timeoutMs);
            w.grecaptcha.ready(() => {
              w.grecaptcha!
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
          fallback: this.config.shalom.recaptchaSiteKey,
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
      await this.navigate(page);
      this.slots.push({ page, navigatedAt: Date.now(), busy: false });
    }
  }

  private async navigate(page: Page): Promise<void> {
    const { webBase, captcha } = this.config.shalom;
    await page.goto(`${webBase}/rastrea`, {
      waitUntil: 'domcontentloaded',
      timeout: captcha.navTimeoutMs,
    });
    await page
      .waitForFunction(
        () =>
          !!(globalThis as unknown as { grecaptcha?: unknown }).grecaptcha,
        { timeout: captcha.navTimeoutMs },
      )
      .catch(() => {
        throw new Error('grecaptcha no apareció tras navegar a /rastrea');
      });
  }

  private async ensureFresh(slot: Slot): Promise<void> {
    const stale = Date.now() - slot.navigatedAt > this.config.shalom.captcha.pageTtlMs;
    if (stale || slot.page.isClosed()) {
      await this.navigate(slot.page);
      slot.navigatedAt = Date.now();
    }
  }

  /** Semáforo simple: espera a que se libere un slot del pool. */
  private async acquireSlot(): Promise<Slot> {
    const deadline = Date.now() + this.config.shalom.captcha.tokenTimeoutMs + 5000;
    for (;;) {
      const free = this.slots.find((s) => !s.busy);
      if (free) {
        free.busy = true;
        return free;
      }
      if (Date.now() > deadline) {
        throw new UpstreamError('shalom-captcha', 'Todas las páginas del pool están ocupadas', {
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
