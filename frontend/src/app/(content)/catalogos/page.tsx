import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getSite, requireBrand } from '@/lib/brand-server';
import { CATALOGS, catalogPath } from '@/lib/sunat-catalogs';
import { pageMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { ApiCta, PageIntro, pageContainer } from '@/components/directory/parts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.mathyu.dev';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  if (site.id !== 'sunat') return {};
  return pageMetadata(site, {
    title: 'Catálogos de SUNAT para facturación electrónica',
    description:
      'Catálogos de códigos de SUNAT para comprobantes electrónicos UBL 2.1: tipo de documento (01), unidades de medida (03), afectación del IGV (07), notas de crédito (09), tipo de operación (51), detracciones (54) y más, con su etiqueta XML.',
    path: catalogPath(),
  });
}

export default async function CatalogsIndexPage() {
  const brand = await requireBrand(['sunat']);
  return (
    <div className={`${pageContainer} flex flex-col gap-14 py-12`}>
      <PageIntro
        crumbs={<Breadcrumbs items={[{ name: brand.name, path: '/' }, { name: 'Catálogos', path: catalogPath() }]} />}
        title="Catálogos de SUNAT para facturación electrónica"
      >
        <p>
          Los códigos que piden las facturas, boletas, notas y guías de remisión electrónicas: qué significa cada uno, en qué etiqueta del XML UBL 2.1 va
          y qué campo del JSON lo lleva si emites con {brand.name}.
        </p>
      </PageIntro>

      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {CATALOGS.map((c) => (
          <li key={c.slug}>
            <Link
              href={catalogPath(c)}
              className="group flex h-full flex-col gap-2 rounded-2xl border border-[var(--border)] bg-white p-6 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md"
            >
              <span className="font-mono text-sm font-semibold text-[var(--accent)]">Catálogo N.° {c.number}</span>
              <h2 className="text-lg font-bold leading-snug tracking-tight">{c.name}</h2>
              <p className="text-[15px] leading-relaxed text-[var(--muted)]">{c.summary}</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold text-[var(--accent)]">
                Ver {c.rows.length} códigos <ArrowRight size={14} aria-hidden className="transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <ApiCta
        brand={brand}
        title="Los catálogos, en JSON"
        text="El endpoint de catálogos devuelve los mismos códigos que ves aquí, para armar tus formularios sin copiarlos a mano. Y con la API no escribes XML: mandas JSON y nosotros firmamos, enviamos a SUNAT y te devolvemos el CDR."
        code={`curl "${API_URL}${brand.apiPrefix}/catalogs" \\\n  -H "x-api-key: $MATHYU_API_KEY"`}
      />

      <p className="rounded-xl bg-[var(--surface)] px-4 py-3 text-sm leading-relaxed text-[var(--muted)]">
        Referencia para integrar la facturación electrónica. La fuente oficial son las especificaciones y catálogos que publica la SUNAT. SUNAT API es un
        servicio independiente de Mathyu&apos;s Solutions: no somos la SUNAT.
      </p>
    </div>
  );
}
