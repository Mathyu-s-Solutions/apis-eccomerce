import Link from 'next/link';
import type { Brand } from '@/lib/brands';

const link = 'text-[var(--on-dark-muted)] transition-colors hover:text-white';

export function Footer({ brand }: { brand: Brand }) {
  return (
    <footer className="bg-[var(--darker)] text-[var(--on-dark-muted)]">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-14">
        <div className="flex flex-col justify-between gap-8 md:flex-row">
          <div className="max-w-sm">
            <p className="text-xl font-extrabold text-white">{brand.name}</p>
            <p className="mt-2 text-[15px] leading-relaxed">{brand.tagline}. Un producto de Mathyu&apos;s Solutions.</p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-[15px] sm:grid-cols-3">
            <div>
              <p className="mb-3 font-semibold text-white">Producto</p>
              <ul className="space-y-2">
                <li><Link href="/" className={link}>Inicio</Link></li>
                <li><Link href="/docs" className={link}>Documentación</Link></li>
                <li><Link href="/pricing" className={link}>Precios</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 font-semibold text-white">Cuenta</p>
              <ul className="space-y-2">
                <li><Link href="/login" className={link}>Ingresar</Link></li>
                <li><Link href="/register" className={link}>Crear cuenta</Link></li>
                <li><Link href="/dashboard" className={link}>Mi panel</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-10 border-t border-white/10 pt-6 text-[13px]">
          © {new Date().getFullYear()} Mathyu&apos;s Solutions.{' '}
          {brand.id === 'sunat'
            ? 'API no oficial: no somos la SUNAT ni representamos al Estado peruano.'
            : `Servicio independiente, no afiliado oficialmente con ${brand.owner}.`}{' '}
          Las marcas pertenecen a sus titulares.
        </p>
      </div>
    </footer>
  );
}
