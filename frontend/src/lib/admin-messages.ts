import { HUB } from './brands';
import { formatNumber } from './utils';

/**
 * Mensajes de WhatsApp que el admin le manda a un cliente con un clic (el link
 * wa.me los deja escritos; se pueden editar antes de enviar).
 */

const hello = (name: string | null) => `Hola${name ? ` ${name.split(' ')[0]}` : ''}`;

/** "20 de diciembre", en hora de Lima. */
export function longDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', timeZone: 'America/Lima' }).format(new Date(iso));
}

const payTo = () => {
  const number = process.env.NEXT_PUBLIC_YAPE_NUMBER;
  return number ? ` al ${number}` : '';
};

/** Tras registrar su pago: ya está activo. */
export function activatedMessage(name: string | null, what: string, until: string | null): string {
  return `${hello(name)}, ¡listo! Tu ${what} de ${HUB.name} ya está activo${until ? ` hasta el ${longDate(until)}` : ''}. Tus API keys ya lo usan, no tienes que cambiar nada en tu integración. Cualquier duda me escribes por aquí.`;
}

/** Su plan vence pronto (o ya venció): cómo renovarlo. */
export function renewalMessage(name: string | null, what: string, expiresAt: string, amountPen: number | null): string {
  const overdue = new Date(expiresAt).getTime() <= Date.now();
  const when = overdue ? `venció el ${longDate(expiresAt)}` : `vence el ${longDate(expiresAt)}`;
  const amount = amountPen ? ` S/ ${amountPen}` : '';
  return `${hello(name)}, te escribo de ${HUB.name}. Tu ${what} ${when}. Para renovarlo puedes yapear o plinear${amount}${payTo()} y enviarme la captura por aquí; lo activo al toque.`;
}

/** Está por agotar su cuota de prueba: ofrecerle un plan. */
export function upgradeMessage(name: string | null, api: string, used: number, limit: number, plan: { name: string; pricedPen: number } | undefined): string {
  const offer = plan ? ` El plan ${plan.name} de ${api} cuesta S/ ${plan.pricedPen} al mes.` : '';
  return `${hello(name)}, te escribo de ${HUB.name}. Vi que este mes ya usaste ${formatNumber(used)} de ${formatNumber(limit)} consultas de prueba de ${api}.${offer} ¿Te ayudo a activarlo? Se paga con Yape o Plin${payTo()}.`;
}
