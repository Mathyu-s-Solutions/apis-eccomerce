import type { ReactNode } from 'react';
import { MessageCircle } from 'lucide-react';
import { BRANDS } from '@/lib/brands';
import { isProduct, PRODUCT_NAME } from '@/lib/plans';
import { formatPhone, whatsappHref } from '@/lib/whatsapp';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Piezas chicas del admin, sin estado: sirven en páginas del servidor y en componentes de cliente. */

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[var(--muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Punto del color de la API (Shalom, Olva, SUNAT) junto a su nombre. */
export function ApiName({ product, className }: { product: string; className?: string }) {
  const color = isProduct(product) ? BRANDS[product].theme.signature : 'var(--muted)';
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium', className)}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      {isProduct(product) ? PRODUCT_NAME[product] : product}
    </span>
  );
}

/** Iniciales del cliente. */
export function Avatar({ name, email, className }: { name: string | null; email: string; className?: string }) {
  const words = (name || email).replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
  return (
    <span aria-hidden className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]', className)}>
      {initials}
    </span>
  );
}

/** Abre el chat de WhatsApp con el cliente, con el mensaje ya escrito. */
export function WhatsAppLink({ phone, text, label = 'WhatsApp', compact = false }: { phone: string; text?: string; label?: string; compact?: boolean }) {
  return (
    <a
      href={whatsappHref(phone, text)}
      target="_blank"
      rel="noreferrer"
      title={`WhatsApp ${formatPhone(phone)}`}
      aria-label={compact ? `${label} (${formatPhone(phone)})` : undefined}
      className={cn(buttonClasses('outline', 'sm'), 'h-8 gap-1.5 px-2.5 text-xs text-green-700 hover:text-green-800', compact && 'w-8 px-0')}
    >
      <MessageCircle size={14} />
      {!compact && label}
    </a>
  );
}

/** Una cifra del resumen. */
export function StatTile({ label, value, hint, children, className }: { label: string; value: ReactNode; hint?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-[var(--border)] bg-white p-5', className)}>
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>}
      {children}
    </div>
  );
}

/** Estado vacío de una lista. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">{children}</p>;
}
