import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';

export interface Email {
  to: string;
  subject: string;
  html: string;
}

/** Envía correos con la API de Resend. Sin RESEND_API_KEY está apagado. */
@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name);

  constructor(@Inject(CONFIG_TOKEN) private readonly config: AppConfig) {}

  get enabled(): boolean {
    return !!this.config.email.resendApiKey;
  }

  /** URL absoluta del panel, para los enlaces de un correo. */
  panelUrl(path: string): string {
    return `${this.config.email.panelUrl}${path}`;
  }

  /** Devuelve si Resend lo aceptó; los errores solo se registran. */
  async send(email: Email): Promise<boolean> {
    const { resendApiKey, from, replyTo } = this.config.email;
    if (!resendApiKey) return false;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${resendApiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: email.to, reply_to: replyTo, subject: email.subject, html: email.html }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.logger.error(`Resend respondió ${res.status}: ${await res.text()}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`No se pudo enviar "${email.subject}": ${String(err)}`);
      return false;
    }
  }
}
