import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, Clock, MapPin, Navigation, Phone } from 'lucide-react';
import type { Brand } from '@/lib/brands';
import { directoryPath, longDate, mapsDirections, type Agency } from '@/lib/directory';
import { panelHref } from '@/lib/urls';
import { cn } from '@/lib/utils';
import { CodeBlock } from '@/components/ui/code-block';
import { ButtonLink } from '@/components/ui/button';

export const pageContainer = 'mx-auto max-w-6xl px-4';

/** Encabezado de una página de contenido: ruta, título y entrada. */
export function PageIntro({ crumbs, eyebrow, title, children }: { crumbs: ReactNode; eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4">
      {crumbs}
      {eyebrow && <p className="mt-4 text-sm font-semibold text-[var(--accent)]">{eyebrow}</p>}
      <h1 className={cn('text-[clamp(30px,4vw,46px)] font-extrabold leading-[1.08] tracking-tight', !eyebrow && 'mt-4')}>{title}</h1>
      {children && <div className="max-w-3xl space-y-3 text-[17px] leading-relaxed text-[var(--muted)]">{children}</div>}
    </header>
  );
}

/** Dirección, horario y teléfono de una agencia. */
export function AgencyCard({ agency, headingLevel = 'h3', linkName = true }: { agency: Agency; headingLevel?: 'h2' | 'h3'; linkName?: boolean }) {
  const Heading = headingLevel;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-white p-5">
      <Heading className="text-lg font-bold leading-snug tracking-tight">
        {linkName ? (
          <Link href={directoryPath.agency(agency)} className="hover:text-[var(--accent)]">
            {agency.name}
          </Link>
        ) : (
          agency.name
        )}
      </Heading>
      <p className="flex gap-2.5 text-[15px] leading-relaxed">
        <MapPin size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
        <span>
          {agency.address}
          {agency.district && <span className="text-[var(--muted)]"> · {agency.district}</span>}
          {agency.reference && <span className="block text-sm text-[var(--muted)]">Referencia: {agency.reference}</span>}
        </span>
      </p>
      {agency.hours.length > 0 && (
        <p className="flex gap-2.5 text-[15px]">
          <Clock size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span>{agency.hours.join(' · ')}</span>
        </p>
      )}
      {agency.phone && (
        <p className="flex gap-2.5 text-[15px]">
          <Phone size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
          <a href={`tel:${agency.phone.replace(/[^\d+]/g, '')}`} className="hover:text-[var(--accent)]">
            {agency.phone}
          </a>
        </p>
      )}
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
        <a href={mapsDirections(agency)} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline">
          <Navigation size={15} aria-hidden /> Cómo llegar
        </a>
        {linkName && (
          <Link href={directoryPath.agency(agency)} className="inline-flex items-center gap-1.5 text-[var(--foreground)] hover:text-[var(--accent)]">
            Ver agencia <ArrowRight size={15} aria-hidden />
          </Link>
        )}
      </div>
    </article>
  );
}

/** La razón de ser de estas páginas: llevar a quien vende por internet a la API. */
export function ApiCta({ brand, title, text, code }: { brand: Brand; title: string; text: string; code: string }) {
  return (
    <section className="grid gap-8 rounded-3xl bg-[var(--dark)] p-7 text-white md:grid-cols-[1fr_1.1fr] md:p-10">
      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold text-[var(--signature)]">{brand.name} para tu tienda</p>
        <h2 className="text-[clamp(24px,3vw,34px)] font-extrabold leading-tight tracking-tight">{title}</h2>
        <p className="leading-relaxed text-[var(--on-dark-muted)]">{text}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <ButtonLink href={panelHref('/register')} size="lg">
            Crear mi API key gratis
          </ButtonLink>
          <ButtonLink href="/docs" size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
            Ver documentación
          </ButtonLink>
        </div>
      </div>
      <div className="min-w-0 self-center">
        <CodeBlock code={code} />
      </div>
    </section>
  );
}

/** De dónde salen los datos y desde cuándo; y que no somos el courier. */
export function SourceNote({ brand, courierName, updatedAt }: { brand: Brand; courierName: string; updatedAt: string }) {
  return (
    <p className="rounded-xl bg-[var(--surface)] px-4 py-3 text-sm leading-relaxed text-[var(--muted)]">
      Datos del catálogo público de agencias de {courierName}, actualizados al {longDate(updatedAt)}. Los horarios pueden cambiar en feriados:
      confírmalos con {courierName} antes de ir. {brand.name} es un servicio independiente de Mathyu&apos;s Solutions, no afiliado a {brand.owner}.
    </p>
  );
}

/** Lista compacta de links (otros departamentos, otras ciudades…). */
export function LinkGrid({ title, links }: { title: string; links: { href: string; label: string; meta?: string }[] }) {
  if (!links.length) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] py-2.5 text-[15px] transition-colors hover:text-[var(--accent)]">
              <span>{l.label}</span>
              {l.meta && <span className="shrink-0 text-sm text-[var(--muted)]">{l.meta}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
