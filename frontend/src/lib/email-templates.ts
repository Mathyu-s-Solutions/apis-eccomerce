import 'server-only';
import { emailLayout, escapeHtml, limaDate, panelUrl } from './email';
import { freePlan, getPlan, groupByBundle, paymentMethodLabel, PRODUCT_NAME, PRODUCTS } from './plans';
import { paymentLabel } from './subscriptions';
import { billingPath } from './urls';

/** Contenido de los correos automáticos. El envío está en email.ts. */

export interface EmailContent {
  subject: string;
  html: string;
}

/** Al dueño: un cliente pagó con Yape/Plin y subió el comprobante (va adjunto). */
export function paymentReceivedEmail({ user, purchase, method, operationCode }: {
  user: { email: string; name: string | null };
  purchase: { name: string; amountPen: number };
  method: string;
  operationCode: string | null;
}): EmailContent {
  const who = user.name ? `${user.name} (${user.email})` : user.email;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#475569">${label}</td><td style="padding:4px 0"><b>${value}</b></td></tr>`;
  const body = `
    <p style="margin:0 0 16px">${escapeHtml(who)} pagó con ${escapeHtml(paymentMethodLabel(method))} y subió su comprobante (va adjunto).</p>
    <table style="border-collapse:collapse;margin:0 0 8px">
      ${row('Compra', escapeHtml(purchase.name))}
      ${row('Monto', `S/ ${purchase.amountPen}`)}
      ${row('Nro. de operación', operationCode ? escapeHtml(operationCode) : '—')}
    </table>
    <p style="margin:16px 0 0">Revisa que el monto haya llegado y apruébalo en el admin: al aprobarlo se activa su plan.</p>`;
  return {
    subject: `Pago por validar: S/ ${purchase.amountPen} de ${user.email} — ${purchase.name}`,
    html: emailLayout({ title: 'Nuevo pago por validar', body, action: { label: 'Validar en el admin', href: panelUrl('/admin') } }),
  };
}

/** Al cliente: revisamos su pago. Aprobado: hasta cuándo quedan sus planes. Rechazado: el motivo. */
export function paymentReviewedEmail({ name, payment, plans }: {
  name: string | null;
  payment: { product: string; plan: string; amountPen: number; method: string; status: string; note: string | null };
  /** Planes que activó el pago, con su nuevo vencimiento (null = no vence). */
  plans: { product: string; plan: string; expiresAt: Date | null }[];
}): EmailContent {
  const label = paymentLabel(payment);
  const paid = `<b>S/ ${payment.amountPen}</b> por <b>${escapeHtml(label)}</b> (${escapeHtml(paymentMethodLabel(payment.method))})`;
  const hello = `<p style="margin:0 0 12px">Hola${name ? ` ${escapeHtml(name)}` : ''},</p>`;

  if (payment.status === 'approved') {
    const until = (s: { expiresAt: Date | null }) => (s.expiresAt ? `hasta el ${limaDate(s.expiresAt)}` : 'sin vencimiento');
    const list = plans.length
      ? `<ul style="margin:0 0 12px;padding-left:20px">${plans.map((s) => `<li><b>${escapeHtml(paymentLabel(s))}</b>, ${until(s)}</li>`).join('')}</ul>`
      : '';
    return {
      subject: `Pago confirmado: ${label}`,
      html: emailLayout({
        title: 'Tu pago está confirmado',
        body: `${hello}<p style="margin:0 0 12px">Confirmamos tu pago de ${paid}. ${plans.length > 1 ? 'Tus planes ya están activos' : 'Tu plan ya está activo'}:</p>${list}
          <p style="margin:0">Tus API keys usan el plan nuevo desde ahora, sin cambiar nada en tu integración.</p>`,
        action: { label: 'Ir a mi panel', href: panelUrl('/dashboard') },
      }),
    };
  }

  const retry = payment.product === 'bundle' ? billingPath({ bundle: payment.plan }) : billingPath({ product: payment.product, plan: payment.plan });
  const reason = payment.note ? `<p style="margin:0 0 12px">Motivo: ${escapeHtml(payment.note)}</p>` : '';
  return {
    subject: `No pudimos validar tu pago de ${label}`,
    html: emailLayout({
      title: 'No pudimos validar tu pago',
      body: `${hello}<p style="margin:0 0 12px">Revisamos tu pago de ${paid} y no pudimos validarlo.</p>${reason}
        <p style="margin:0">Si crees que es un error, responde este correo con la captura de la operación y lo revisamos.</p>`,
      action: { label: 'Volver a intentarlo', href: panelUrl(retry) },
    }),
  };
}

/** Planes de un aviso, como los compra: un pack completo va junto ("Pack Couriers"). */
function planGroups(subs: { product: string; plan: string; expiresAt: Date }[]) {
  return groupByBundle(subs).map(({ bundle, subs: [first, ...rest] }) => ({
    label: bundle ? `${bundle.name} (${bundle.description})` : paymentLabel(first),
    expiresAt: rest.reduce((max, s) => (s.expiresAt > max ? s.expiresAt : max), first.expiresAt),
    renew: bundle
      ? billingPath({ bundle: bundle.id })
      : (getPlan(first.product, first.plan)?.pricedPen ?? 0) > 0
        ? billingPath({ product: first.product, plan: first.plan })
        : '/dashboard/billing',
  }));
}

/** Al cliente: sus planes vencen en unos días (no tiene un pago por validar). */
export function planExpiringEmail({ name, subs }: {
  name: string | null;
  subs: { product: string; plan: string; expiresAt: Date }[];
}): EmailContent {
  const groups = planGroups(subs);
  const single = groups.length === 1 ? groups[0] : null;
  const what = single
    ? `<p style="margin:0 0 12px">Tu plan <b>${escapeHtml(single.label)}</b> vence el <b>${limaDate(single.expiresAt)}</b>.</p>`
    : `<p style="margin:0 0 8px">Estos planes vencen pronto:</p>
       <ul style="margin:0 0 12px;padding-left:20px">${groups.map((g) => `<li><b>${escapeHtml(g.label)}</b>, el ${limaDate(g.expiresAt)}</li>`).join('')}</ul>`;

  return {
    subject: single ? `Tu plan ${single.label} vence el ${limaDate(single.expiresAt)}` : 'Tus planes vencen pronto',
    html: emailLayout({
      title: single ? 'Tu plan vence pronto' : 'Tus planes vencen pronto',
      body: `<p style="margin:0 0 12px">Hola${name ? ` ${escapeHtml(name)}` : ''},</p>${what}
        <p style="margin:0 0 12px">Renuévalo con Yape o Plin antes de esa fecha para que tu integración no pase al plan gratis. Validamos cada pago a mano, así que mejor no dejarlo para el último día.</p>
        <p style="margin:0">Si renuevas el mismo plan antes de que venza, el mes nuevo se suma al final del actual: no pierdes días.</p>`,
      action: { label: single ? 'Renovar mi plan' : 'Renovar mis planes', href: panelUrl(single?.renew ?? '/dashboard/billing') },
    }),
  };
}

/**
 * Al cliente: se le venció uno o más planes. Un pack vencido completo va junto,
 * y si ya tiene un pago por validar se lo decimos en vez de pedirle que pague.
 */
export function planExpiredEmail({ name, subs, pendingPayment }: {
  name: string | null;
  subs: { product: string; plan: string; expiresAt: Date }[];
  pendingPayment?: { product: string; plan: string; createdAt: Date };
}): EmailContent {
  const groups = planGroups(subs);
  const single = groups.length === 1 ? groups[0] : null;

  const what = single
    ? `<p style="margin:0 0 12px">Tu plan <b>${escapeHtml(single.label)}</b> venció el <b>${limaDate(single.expiresAt)}</b>.</p>`
    : `<p style="margin:0 0 8px">Estos planes vencieron:</p>
       <ul style="margin:0 0 12px;padding-left:20px">${groups.map((g) => `<li><b>${escapeHtml(g.label)}</b>, el ${limaDate(g.expiresAt)}</li>`).join('')}</ul>`;

  const free = PRODUCTS.filter((p) => subs.some((s) => s.product === p)).map((p) => `${freePlan(p).monthlyLimit} al mes en ${PRODUCT_NAME[p]}`);
  const fallback = free.length
    ? `<p style="margin:0 0 12px">Tus API keys siguen funcionando, ahora con la cuota del plan gratis: ${escapeHtml(joinEs(free))}.</p>`
    : '';

  const next = pendingPayment
    ? `<p style="margin:0">Ya recibimos tu pago de <b>${escapeHtml(paymentLabel(pendingPayment))}</b> del ${limaDate(pendingPayment.createdAt)} y lo estamos validando: apenas lo aprobemos se reactiva tu plan. No necesitas hacer nada más.</p>`
    : `<p style="margin:0">Renuévalo con Yape o Plin desde tu panel. Si renuevas el mismo plan, mantienes tu día de corte de cada mes.</p>`;

  return {
    subject: single ? `Venció tu plan ${single.label}` : 'Vencieron tus planes',
    html: emailLayout({
      title: single ? 'Tu plan venció' : 'Tus planes vencieron',
      body: `<p style="margin:0 0 12px">Hola${name ? ` ${escapeHtml(name)}` : ''},</p>${what}${fallback}${next}`,
      action: pendingPayment
        ? { label: 'Ver mi panel', href: panelUrl('/dashboard') }
        : { label: single ? 'Renovar mi plan' : 'Renovar mis planes', href: panelUrl(single?.renew ?? '/dashboard/billing') },
    }),
  };
}

/** "a, b y c" */
function joinEs(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}
