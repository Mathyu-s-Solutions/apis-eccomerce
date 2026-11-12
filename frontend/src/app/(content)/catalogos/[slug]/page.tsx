import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSite, requireBrand } from '@/lib/brand-server';
import { CATALOGS, catalogPath, findCatalog } from '@/lib/sunat-catalogs';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { CodeBlock } from '@/components/ui/code-block';
import { ApiCta, LinkGrid, PageIntro, pageContainer } from '@/components/directory/parts';
import { API_URL } from '@/lib/api-url';


type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await getSite();
  const catalog = findCatalog((await params).slug);
  if (site.id !== 'sunat' || !catalog) return {};
  return pageMetadata(site, {
    title: `Catálogo ${catalog.number} SUNAT: ${catalog.name}`,
    description: `Catálogo N.° ${catalog.number} de SUNAT, ${catalog.name}: ${catalog.summary} Tabla de códigos, etiqueta UBL y ejemplo en JSON.`,
    path: catalogPath(catalog),
  });
}

export default async function CatalogPage({ params }: Props) {
  const brand = await requireBrand(['sunat']);
  const catalog = findCatalog((await params).slug);
  if (!catalog) notFound();
  const others = CATALOGS.filter((c) => c.slug !== catalog.slug);

  return (
    <div className={`${pageContainer} flex flex-col gap-12 py-12`}>
      <PageIntro
        crumbs={
          <Breadcrumbs
            items={[
              { name: brand.name, path: '/' },
              { name: 'Catálogos', path: catalogPath() },
              { name: `Catálogo ${catalog.number}`, path: catalogPath(catalog) },
            ]}
          />
        }
        eyebrow={`Catálogo N.° ${catalog.number} de SUNAT`}
        title={catalog.name}
      >
        {catalog.intro.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </PageIntro>

      <dl className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <dt className="text-sm font-semibold text-[var(--muted)]">En el XML (UBL 2.1)</dt>
          <dd className="mt-1.5 font-mono text-[15px] leading-relaxed">{catalog.ubl}</dd>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <dt className="text-sm font-semibold text-[var(--muted)]">En el JSON de {brand.name}</dt>
          <dd className="mt-1.5 font-mono text-[15px] leading-relaxed">{catalog.field}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold tracking-tight">
          Códigos del catálogo {catalog.number} <span className="text-base font-medium text-[var(--muted)]">· {catalog.rows.length}</span>
        </h2>
        {catalog.partial && <p className="text-[15px] text-[var(--muted)]">{catalog.partial}</p>}
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
          <table className="w-full text-[15px]">
            <caption className="sr-only">
              Catálogo N.° {catalog.number} de SUNAT: {catalog.name}
            </caption>
            <thead>
              <tr className="bg-[var(--surface)] text-left text-sm">
                {catalog.columns.map((col) => (
                  <th key={col.key} scope="col" className="px-4 py-3 font-semibold">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {catalog.rows.map((row) => (
                <tr key={row.code} id={`codigo-${row.code}`}>
                  {catalog.columns.map((col, i) =>
                    i === 0 ? (
                      <th key={col.key} scope="row" className="whitespace-nowrap px-4 py-2.5 text-left font-mono font-semibold text-[var(--accent)]">
                        {row[col.key]}
                      </th>
                    ) : (
                      <td key={col.key} className={cn('px-4 py-2.5', col.mono && 'font-mono text-sm')}>
                        {row[col.key]}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {catalog.caution && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">{catalog.caution}</p>}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Ejemplo en el JSON de la API</h2>
        <p className="text-[15px] text-[var(--muted)]">
          Con {brand.name} no armas el XML: mandas el código en el campo <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-sm">{catalog.field}</code> y
          la API genera el XML UBL 2.1, lo firma y lo envía a SUNAT.
        </p>
        <CodeBlock code={catalog.example} label="JSON" />
      </section>

      <ApiCta
        brand={brand}
        title="Emite sin pelearte con los catálogos"
        text="La API valida cada código antes de enviar a SUNAT y te dice qué campo está mal, en español. Empiezas gratis en SUNAT beta, sin certificado."
        code={`curl "${API_URL}${brand.apiPrefix}/catalogs" \\\n  -H "x-api-key: $MATHYU_API_KEY"`}
      />

      <LinkGrid
        title="Otros catálogos de SUNAT"
        links={others.map((c) => ({ href: catalogPath(c), label: `${c.number} · ${c.name}` }))}
      />

      <p className="text-sm text-[var(--muted)]">
        ¿Buscas el tipo de cambio para facturar en dólares?{' '}
        <Link href="/tipo-de-cambio" className="font-semibold text-[var(--accent)] hover:underline">
          Tipo de cambio SBS de hoy
        </Link>
        .
      </p>
    </div>
  );
}
