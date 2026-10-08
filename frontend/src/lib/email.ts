import 'server-only';

/**
 * Notificación por correo. Si no hay RESEND_API_KEY configurada, solo registra
 * en logs (el admin igual ve el pago en el panel). Usa fetch, sin dependencias.
 */
export async function notifyOwner(subject: string, html: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.OWNER_EMAIL;
  const from = process.env.EMAIL_FROM ?? 'Mathyu APIs <onboarding@resend.dev>';

  if (!key || !to) {
    console.log(`[email] (no enviado, falta config) ${subject}`);
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error(`[email] Resend respondió ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error(`[email] Error enviando: ${String(err)}`);
  }
}
