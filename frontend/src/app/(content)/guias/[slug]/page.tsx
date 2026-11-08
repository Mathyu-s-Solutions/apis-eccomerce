import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSite } from '@/lib/brand-server';
import { findGuide, guidePath, guidesFor } from '@/lib/guides';
import { pageMetadata, requestOrigin } from '@/lib/seo';
import { panelHref } from '@/lib/urls';
import { formatDate } from '@/lib/utils';
import { Breadcrumbs, JsonLd } from '@/components/site/breadcrumbs';
import { ButtonLink } from '@/components/ui/button';
import { pageContainer } from '@/components/directory/parts';

type Props = { params: Promise<{ slug: string }> };

/** Estilos del cuerpo de la guía (HTML generado desde Markdown). */
const prose = [
  'text-[17px] leading-[1.75] text-[var(--foreground)]',
  '[&_p]:my-5 [&_strong]:font-semibold',
  '[&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:scroll-mt-24 [&_h2]:text-[28px] [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:tracking-tight',
  '[&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:scroll-mt-24 [&_h3]:text-xl [&_h3]:font-bold',
  '[&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:font-bold',
  '[&_a]:font-medium [&_a]:text-[var(--accent)] [&_a]:underline [&_a]:underline-offset-2',
  '[&_ul]:my-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6',
  '[&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-[var(--accent)] [&_blockquote]:bg-[var(--surface)] [&_blockquote]:px-5 [&_blockquote]:py-1 [&_blockquote]:text-[var(--muted)]',
  '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-[var(--surface)] [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[0.9em]',
  '[&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-900 [&_pre]:p-5 [&_pre]:text-sm [&_pre]:leading-relaxed [&_pre]:text-slate-100',
  '[&_table]:my-6 [&_table]:block [&_table]:overflow-x-auto [&_table]:text-[15px] [&_th]:border-b-2 [&_th]:border-[var(--foreground)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border-b [&_td]:border-[var(--border)] [&_td]:px-3 [&_td]:py-2',
].join(' ');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await getSite();
  const guide = findGuide(site.id, (await params).slug);
  if (!guide) return {};
  const base = pageMetadata(site, { title: guide.title, description: guide.description, path: guidePath(guide) });
  return {
    ...base,
    keywords: guide.keywords,
    openGraph: { ...base.openGraph, type: 'article', publishedTime: guide.date, modifiedTime: guide.updated },
  };
}

export default async function GuidePage({ params }: Props) {
  const site = await getSite();
  const guide = findGuide(site.id, (await params).slug);
  if (!guide) notFound();
  const origin = await requestOrigin();
  const more = guidesFor(site.id)
    .filter((g) => g.slug !== guide.slug)
    .slice(0, 4);
  const publisher = { '@type': 'Organization', name: "Mathyu's Solutions", url: origin, logo: `${origin}/brand/hub/apple-icon.png` };

  return (
    <div className={`${pageContainer} py-12`}>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'TechArticle',
          headline: guide.title,
          description: guide.description,
          datePublished: guide.date,
          dateModified: guide.updated,
          inLanguage: 'es-PE',
          keywords: guide.keywords.join(', '),
          mainEntityOfPage: `${origin}${guidePath(guide)}`,
          image: `${origin}/brand/${site.id}/og.png`,
          author: publisher,
          publisher,
        }}
      />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_260px]">
        <article className="min-w-0 max-w-3xl">
          <Breadcrumbs
            items={[
              { name: site.name, path: '/' },
              { name: 'Guías', path: guidePath() },
              { name: guide.title, path: guidePath(guide) },
            ]}
          />
          <h1 className="mt-6 text-[clamp(30px,4vw,44px)] font-extrabold leading-[1.1] tracking-tight">{guide.title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-[var(--muted)]">{guide.description}</p>
          <p className="mt-4 text-sm text-[var(--muted)]">
            <time dateTime={guide.date}>{formatDate(`${guide.date}T12:00:00Z`)}</time>
            {guide.updated !== guide.date && (
              <>
                {' '}
                · actualizada el <time dateTime={guide.updated}>{formatDate(`${guide.updated}T12:00:00Z`)}</time>
              </>
            )}{' '}
            · {guide.readingMinutes} min de lectura
          </p>
          <div className={`mt-6 ${prose}`} dangerouslySetInnerHTML={{ __html: guide.html }} />

          <section className="mt-14 flex flex-col gap-4 rounded-3xl bg-[var(--dark)] p-7 text-white md:p-9">
            <h2 className="text-2xl font-extrabold tracking-tight">Pruébalo con tu propia API key</h2>
            <p className="leading-relaxed text-[var(--on-dark-muted)]">
              Crea tu cuenta gratis: el plan gratis alcanza para probar todo lo de esta guía. Pagas con Yape o Plin solo cuando necesites más.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href={panelHref('/register')} size="lg">
                Crear mi cuenta gratis
              </ButtonLink>
              {site.id !== 'hub' && (
                <ButtonLink href="/docs" size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Ver documentación
                </ButtonLink>
              )}
            </div>
          </section>
        </article>

        <aside className="flex flex-col gap-8 lg:sticky lg:top-24 lg:self-start">
          {guide.headings.length > 2 && (
            <nav aria-label="En esta guía">
              <p className="text-sm font-semibold">En esta guía</p>
              <ol className="mt-3 space-y-2 border-l border-[var(--border)] text-sm">
                {guide.headings.map((h) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`} className="-ml-px block border-l border-transparent pl-3 text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
                      {h.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {more.length > 0 && (
            <nav aria-label="Más guías">
              <p className="text-sm font-semibold">Más guías</p>
              <ul className="mt-3 space-y-3 text-sm">
                {more.map((g) => (
                  <li key={g.slug}>
                    <Link href={guidePath(g)} className="leading-snug hover:text-[var(--accent)]">
                      {g.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>
      </div>
    </div>
  );
}
