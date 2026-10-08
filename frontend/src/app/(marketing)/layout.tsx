import type { ReactNode } from 'react';
import { getSite } from '@/lib/brand-server';
import { Header } from '@/components/site/header';
import { Footer } from '@/components/site/footer';

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const site = await getSite();
  return (
    <>
      <Header site={site} />
      <main className="flex-1">{children}</main>
      <Footer site={site} />
    </>
  );
}
