import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { breadcrumbLd, jsonLd, requestOrigin, type Crumb } from '@/lib/seo';

/** Datos estructurados (JSON-LD) en un <script>. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}

/** Ruta de navegación visible y su BreadcrumbList para buscadores. El último paso es la página actual. */
export async function Breadcrumbs({ items }: { items: Crumb[] }) {
  const origin = await requestOrigin();
  return (
    <>
      <JsonLd data={breadcrumbLd(origin, items)} />
      <nav aria-label="Ruta de navegación" className="text-sm text-[var(--muted)]">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {items.map((c, i) => (
            <li key={c.path} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={14} aria-hidden className="opacity-60" />}
              {i < items.length - 1 ? (
                <Link href={c.path} className="transition-colors hover:text-[var(--accent)]">
                  {c.name}
                </Link>
              ) : (
                <span aria-current="page" className="font-medium text-[var(--foreground)]">
                  {c.name}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
