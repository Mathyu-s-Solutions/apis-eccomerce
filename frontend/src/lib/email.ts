import 'server-only';
import { HUB } from './brands';
import { PANEL_URL } from './urls';

/**
 * Correos con Resend (API REST con fetch, sin dependencias). Sin RESEND_API_KEY
 * solo se registran en logs: el admin igual ve los pagos en el panel.
 */

export interface Email {
  to: string | string[];
  subject: string;
  html: string;
  /** A dónde llegan las respuestas (el remitente no recibe correo). */
  replyTo?: string;
  attachments?: { filename: string; content: Buffer }[];
  /** Resend no repite un envío con la misma clave durante 24 h. */
  idempotencyKey?: string;
}

/** Envía un correo. Devuelve si Resend lo aceptó; los errores solo se registran. */
export async function sendEmail(email: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] (no enviado, falta RESEND_API_KEY) ${email.subject}`);
    return false;
  }

  const headers: Record<string, string> = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  if (email.idempotencyKey) headers['idempotency-key'] = email.idempotencyKey;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || `${HUB.name} <onboarding@resend.dev>`,
        to: email.to,
        subject: email.subject,
        html: email.html,
        reply_to: email.replyTo,
        attachments: email.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[email] Resend respondió ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[email] Error enviando: ${String(err)}`);
    return false;
  }
}

/** Aviso al dueño (OWNER_EMAIL), p. ej. un pago por validar. */
export async function notifyOwner(subject: string, html: string, attachments?: Email['attachments']): Promise<boolean> {
  const to = process.env.OWNER_EMAIL;
  if (!to) {
    console.log(`[email] (no enviado, falta OWNER_EMAIL) ${subject}`);
    return false;
  }
  return sendEmail({ to, subject, html, attachments });
}

/**
 * URL absoluta del panel, para los enlaces de un correo. Sin NEXT_PUBLIC_PANEL_URL,
 * el dominio de producción de Vercel (o localhost en desarrollo).
 */
export function panelUrl(path: string): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = PANEL_URL || (vercel ? `https://${vercel}` : 'http://localhost:3000');
  return `${base}${path}`;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** "8 de noviembre de 2026", en hora de Lima (los planes vencen al final de un día de Lima). */
export function limaDate(date: Date): string {
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/**
 * Marco común de los correos: título, cuerpo (HTML ya escapado) y un botón
 * opcional. Estilos en línea, que es lo que respetan los clientes de correo.
 */
export function emailLayout({ title, body, action }: { title: string; body: string; action?: { label: string; href: string } }): string {
  const t = HUB.theme;
  const button = action
    ? `<p style="margin:28px 0 8px"><a href="${escapeHtml(action.href)}" style="display:inline-block;background:${t.primary};color:${t.onPrimary};text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${escapeHtml(action.label)}</a></p>`
    : '';
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:${t.section}">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${t.foreground};font-size:15px;line-height:1.6">
    <p style="margin:0 0 24px;font-weight:700;font-size:16px;color:${t.primary}">${escapeHtml(HUB.name)}</p>
    <div style="background:#ffffff;border:1px solid ${t.tint};border-radius:12px;padding:28px">
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(title)}</h1>
      ${body}
      ${button}
    </div>
    <p style="margin:20px 0 0;font-size:12px;color:${t.muted}">${escapeHtml(HUB.name)} · ${escapeHtml(HUB.tagline)}</p>
  </div>
</body>
</html>`;
}
