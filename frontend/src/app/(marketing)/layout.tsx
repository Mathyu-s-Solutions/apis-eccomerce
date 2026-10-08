import type { ReactNode } from 'react';
import { getBrand } from '@/lib/brand-server';
import { Header } from '@/components/site/header';
import { Footer } from '@/components/site/footer';

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const brand = await getBrand();
  return (
    <>
      <Header brand={brand} />
      <main className="flex-1">{children}</main>
      <Footer brand={brand} />
    </>
  );
}
