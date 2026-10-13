import type { ReactNode } from 'react';
import { LEGAL, contactEmail } from '@/lib/legal';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Correo de contacto como link. */
export function ContactLink() {
  const email = contactEmail();
  return (
    <a href={`mailto:${email}`} className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
      {email}
    </a>
  );
}

/** Página legal: título, fecha de la versión, índice y secciones numeradas. */
export function LegalPage({ title, intro, sections }: { title: string; intro: ReactNode; sections: LegalSection[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <p className="text-sm font-medium text-[var(--accent)]">Legal</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">Última actualización: {LEGAL.updatedAt}</p>
      <div className="mt-6 space-y-3 text-[15px] leading-relaxed text-[var(--muted)]">{intro}</div>

      <nav aria-label="Contenido" className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <p className="text-sm font-semibold">Contenido</p>
        <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-[var(--muted)] hover:text-[var(--accent)]">
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="text-xl font-semibold tracking-tight">
              {i + 1}. {s.title}
            </h2>
            <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-[var(--muted)] [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-[var(--foreground)] [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
              {s.body}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-14 border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)]">
        {LEGAL.owner}
        {LEGAL.ruc ? ` · RUC ${LEGAL.ruc}` : ''}
        {LEGAL.address ? ` · ${LEGAL.address}` : ''} · Contacto: <ContactLink />
      </p>
    </div>
  );
}
