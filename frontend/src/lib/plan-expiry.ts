import 'server-only';
import { prisma } from './db';
import { contactEmail } from './legal';
import { sendEmail } from './email';
import { planExpiredEmail, planExpiringEmail } from './email-templates';

/**
 * Avisos de vencimiento: los corre el cron diario (vercel.json, 8:00 de Lima).
 *  - expiring: el plan vence en los próximos días (si no tiene un pago por validar);
 *  - expired: el plan venció hace poco.
 * Un correo por cliente; cada aviso queda en `sent_emails` para no repetirlo.
 */
type Notice = 'expiring' | 'expired';

const DAY_MS = 86_400_000;

/**
 * Qué vencimientos toca avisar. Los planes vencen al final de un día de Lima y el
 * cron corre a las 8:00: con 4 días, el recordatorio sale 3 días antes. Para los
 * vencidos, 3 días de margen: si un día falla Resend, se reintenta al siguiente.
 */
function dueWindow(notice: Notice, now: Date) {
  return notice === 'expiring'
    ? { gt: now, lte: new Date(now.getTime() + 4 * DAY_MS) }
    : { lte: now, gt: new Date(now.getTime() - 3 * DAY_MS) };
}

/** Clave del aviso: incluye el vencimiento, así que al renovar hay avisos nuevos. */
function noticeKey(notice: Notice, sub: { id: string; expiresAt: Date }): string {
  return `plan-${notice}:${sub.id}:${sub.expiresAt.toISOString()}`;
}

export interface NoticeResult {
  due: number;
  sent: number;
  failed: number;
}

export async function notifyPlanExpiry(now = new Date()): Promise<Record<Notice, NoticeResult>> {
  return { expiring: await notify('expiring', now), expired: await notify('expired', now) };
}

async function notify(notice: Notice, now: Date): Promise<NoticeResult> {
  const rows = await prisma.subscription.findMany({
    where: { plan: { not: 'free' }, expiresAt: dueWindow(notice, now) },
    select: { id: true, userId: true, product: true, plan: true, expiresAt: true, user: { select: { email: true, name: true } } },
  });
  const subs = rows.flatMap((s) => (s.expiresAt ? [{ ...s, expiresAt: s.expiresAt }] : []));
  const notified = await prisma.sentEmail.findMany({ where: { key: { in: subs.map((s) => noticeKey(notice, s)) } } });
  const done = new Set(notified.map((n) => n.key));

  const byUser = new Map<string, typeof subs>();
  for (const sub of subs) {
    if (done.has(noticeKey(notice, sub))) continue;
    byUser.set(sub.userId, [...(byUser.get(sub.userId) ?? []), sub]);
  }
  if (byUser.size === 0) return { due: 0, sent: 0, failed: 0 };

  const pending = await prisma.payment.findMany({
    where: { userId: { in: [...byUser.keys()] }, status: 'pending' },
    select: { userId: true, product: true, plan: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  let due = 0;
  let sent = 0;
  let failed = 0;
  for (const [userId, userSubs] of byUser) {
    const pendingPayment = pending.find((p) => p.userId === userId);
    // Ya pagó y está por validarse: no le recordamos que pague.
    if (notice === 'expiring' && pendingPayment) continue;
    due++;

    // Se reclama antes de enviar: si el cron corre dos veces a la vez, solo uno manda.
    const keys = await claim(userSubs.map((s) => noticeKey(notice, s)));
    const mine = userSubs.filter((s) => keys.includes(noticeKey(notice, s)));
    if (mine.length === 0) continue;

    const { user } = mine[0];
    const email = notice === 'expiring'
      ? planExpiringEmail({ name: user.name, subs: mine })
      : planExpiredEmail({ name: user.name, subs: mine, pendingPayment });
    if (await sendEmail({ to: user.email, replyTo: contactEmail(), ...email })) {
      sent++;
    } else {
      failed++;
      await prisma.sentEmail.deleteMany({ where: { key: { in: keys } } }); // mañana se reintenta
    }
  }
  return { due, sent, failed };
}

/** Anota las claves que nadie anotó antes (ON CONFLICT DO NOTHING) y devuelve esas. */
async function claim(keys: string[]): Promise<string[]> {
  const claimed: string[] = [];
  for (const key of keys) {
    const { count } = await prisma.sentEmail.createMany({ data: [{ key }], skipDuplicates: true });
    if (count === 1) claimed.push(key);
  }
  return claimed;
}
