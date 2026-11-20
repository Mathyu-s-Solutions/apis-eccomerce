'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, CreditCard, LayoutDashboard, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: 'Resumen', icon: LayoutDashboard, exact: true },
  { href: '/admin/payments', label: 'Pagos', icon: CreditCard },
  { href: '/admin/clients', label: 'Clientes', icon: Users },
];

const item = 'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors';
const idle = 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]';

export function AdminNav({ pending, email }: { pending: number; email: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex w-full flex-row gap-1 overflow-x-auto border-b border-[var(--border)] p-3 md:w-60 md:shrink-0 md:flex-col md:border-b-0 md:border-r md:p-4">
      <div className="hidden px-2 pb-4 md:block">
        <p className="truncate text-sm font-medium">{email}</p>
        <p className="text-xs text-[var(--muted)]">Administrador</p>
      </div>
      {NAV.map((n) => {
        const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={cn(item, active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : idle)}>
            <n.icon size={17} />
            {n.label}
            {n.href === '/admin/payments' && pending > 0 && (
              <span className="ml-auto rounded-full bg-amber-500 px-1.5 py-px text-[11px] font-semibold leading-4 text-white" aria-label={`${pending} por validar`}>
                {pending}
              </span>
            )}
          </Link>
        );
      })}
      <Link href="/dashboard" className={cn(item, idle, 'md:mt-auto')}>
        <ArrowLeft size={17} />
        Mi panel
      </Link>
    </nav>
  );
}
