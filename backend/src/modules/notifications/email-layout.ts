/**
 * Marco de los correos: el mismo que los del portal (frontend/src/lib/email.ts),
 * con los colores del sitio central. Estilos en línea, que es lo que respetan
 * los clientes de correo.
 */

const BRAND = {
  name: "Mathyu's APIs",
  tagline: 'Envíos y facturación para tu ecommerce en Perú',
  primary: '#4F46E5',
  onPrimary: '#FFFFFF',
  foreground: '#0F172A',
  muted: '#475569',
  tint: '#E0E7FF',
  section: '#F8FAFC',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** "8 de noviembre de 2026", en hora de Lima. */
export function limaDate(date: Date): string {
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/** "2026-11-08" en hora de Lima. */
export function limaDay(date: Date): string {
  return new Date(date.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/** Párrafo con el margen de los correos. `html` ya escapado. */
export const p = (html: string, last = false) => `<p style="margin:0 0 ${last ? 0 : 12}px">${html}</p>`;

export function emailLayout({ title, body, action }: { title: string; body: string; action?: { label: string; href: string } }): string {
  const b = BRAND;
  const button = action
    ? `<p style="margin:28px 0 8px"><a href="${escapeHtml(action.href)}" style="display:inline-block;background:${b.primary};color:${b.onPrimary};text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${escapeHtml(action.label)}</a></p>`
    : '';
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:${b.section}">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${b.foreground};font-size:15px;line-height:1.6">
    <p style="margin:0 0 24px;font-weight:700;font-size:16px;color:${b.primary}">${escapeHtml(b.name)}</p>
    <div style="background:#ffffff;border:1px solid ${b.tint};border-radius:12px;padding:28px">
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(title)}</h1>
      ${body}
      ${button}
    </div>
    <p style="margin:20px 0 0;font-size:12px;color:${b.muted}">${escapeHtml(b.name)} · ${escapeHtml(b.tagline)}</p>
  </div>
</body>
</html>`;
}
