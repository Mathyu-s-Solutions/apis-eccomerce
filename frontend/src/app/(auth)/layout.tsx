import type { ReactNode } from 'react';
import Link from 'next/link';
import { Boxes } from 'lucide-react';
import { getBrand } from '@/lib/brand-server';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const brand = await getBrand();
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg brand-mark">
          <Boxes size={20} />
        </span>
        {brand.name}
      </Link>
      {children}
    </main>
  );
}
