'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { KeyRound, LayoutDashboard, CreditCard, ShieldCheck, LogOut, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { startNavigationProgress } from '@/components/site/navigation-progress';

const NAV = [
  { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/keys', label: 'API keys', icon: KeyRound },
  { href: '/dashboard/sunat', label: 'Facturación SUNAT', icon: FileText },
  { href: '/dashboard/billing', label: 'Pagos y planes', icon: CreditCard },
];

export function Sidebar({ isAdmin, email }: { isAdmin: boolean; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    startNavigationProgress();
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  const items = [...NAV, ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: ShieldCheck }] : [])];

  return (
    <aside className="flex w-full flex-row gap-1 overflow-x-auto border-b border-[var(--border)] p-3 md:w-64 md:flex-col md:border-b-0 md:border-r md:p-4">
      <div className="hidden px-2 pb-4 md:block">
        <p className="truncate text-sm font-medium">{email}</p>
        <p className="text-xs text-[var(--muted)]">Tu cuenta</p>
      </div>
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]',
            )}
          >
            <item.icon size={17} />
            {item.label}
          </Link>
        );
      })}
      <button
        onClick={logout}
        disabled={leaving}
        className="ml-auto flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)] disabled:opacity-60 md:ml-0 md:mt-auto"
      >
        {leaving ? <Loader2 size={17} className="animate-spin" /> : <LogOut size={17} />}
        Salir
      </button>
    </aside>
  );
}
