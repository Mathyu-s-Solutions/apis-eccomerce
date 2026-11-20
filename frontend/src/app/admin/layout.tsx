import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { getCurrentUser } from '@/lib/current-user';
import { pendingCount } from '@/lib/admin';
import { HUB } from '@/lib/brands';
import { NO_INDEX, siteIcons } from '@/lib/seo';
import { PanelFrame } from '@/components/site/panel-frame';
import { AdminNav } from '@/components/admin/admin-nav';
import { RegisterPaymentButton } from '@/components/admin/register-payment';
import { ToastProvider } from '@/components/admin/toast';

export const metadata: Metadata = {
  // El default pasa por la plantilla de la raíz ("Admin · Mathyu's APIs"); las páginas, por la del admin.
  title: { default: 'Admin', template: `%s · Admin · ${HUB.name}` },
  icons: siteIcons('hub'),
  robots: NO_INDEX,
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.isAdmin) redirect('/dashboard');
  const pending = await pendingCount();

  return (
    <PanelFrame>
      <ToastProvider>
        <header className="border-b border-[var(--border)]">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-2 font-semibold">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg brand-mark"><Boxes size={18} /></span>
              <span className="truncate">{HUB.name}</span>
              <span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs font-semibold text-[var(--accent)]">Admin</span>
            </div>
            <RegisterPaymentButton size="sm" />
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col md:flex-row">
          <AdminNav pending={pending} email={user.email} />
          <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
        </div>
      </ToastProvider>
    </PanelFrame>
  );
}
