import Link from 'next/link';
import type { Brand } from '@/lib/brands';

export function Footer({ brand }: { brand: Brand }) {
  return (
    <footer className="mt-24 border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-col justify-between gap-8 md:flex-row">
          <div className="max-w-sm">
            <p className="font-semibold">{brand.name}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">{brand.tagline}. Un producto de Mathyu&apos;s Solutions.</p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-sm">
            <div>
              <p className="mb-3 font-medium">Producto</p>
              <ul className="space-y-2 text-[var(--muted)]">
                <li><Link href="/" className="hover:text-[var(--foreground)]">Inicio</Link></li>
                <li><Link href="/docs" className="hover:text-[var(--foreground)]">Documentación</Link></li>
                <li><Link href="/pricing" className="hover:text-[var(--foreground)]">Precios</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 font-medium">Cuenta</p>
              <ul className="space-y-2 text-[var(--muted)]">
                <li><Link href="/login" className="hover:text-[var(--foreground)]">Ingresar</Link></li>
                <li><Link href="/register" className="hover:text-[var(--foreground)]">Crear cuenta</Link></li>
                <li><Link href="/dashboard" className="hover:text-[var(--foreground)]">Mi panel</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-10 text-xs text-[var(--muted)]">
          © {new Date().getFullYear()} Mathyu&apos;s Solutions. No afiliado oficialmente con {brand.product}.
        </p>
      </div>
    </footer>
  );
}
