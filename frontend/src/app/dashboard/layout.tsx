import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { getCurrentUser } from '@/lib/current-user';
import { HUB } from '@/lib/brands';
import { siteHref } from '@/lib/urls';
import { Sidebar } from '@/components/dashboard/sidebar';
import { PanelFrame } from '@/components/site/panel-frame';

export const metadata: Metadata = { title: { default: `Mi panel · ${HUB.name}`, template: `%s · ${HUB.name}` } };

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <PanelFrame>
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href={siteHref('hub')} className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg brand-mark">
              <Boxes size={18} />
            </span>
            {HUB.name}
          </Link>
          <span className="text-sm text-[var(--muted)]">Panel de todas tus APIs</span>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col md:flex-row">
        <Sidebar isAdmin={user.isAdmin} email={user.email} />
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </PanelFrame>
  );
}
