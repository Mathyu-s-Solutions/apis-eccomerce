import type { Metadata } from 'next';
import Link from 'next/link';
import { getSite, requireBrand } from '@/lib/brand-server';
import { COURIER_NAME, COURIERS, directoryPath, getDirectory, longDate, type CourierId } from '@/lib/directory';
import { pageMetadata } from '@/lib/seo';
import { formatNumber } from '@/lib/utils';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { DirectoryMap } from '@/components/directory/directory-map';
import { ApiCta, LinkGrid, PageIntro, pageContainer, SourceNote } from '@/components/directory/parts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.mathyu.dev';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  if (!COURIERS.includes(site.id as CourierId)) return {};
  const courier = site.id as CourierId;
  const dir = getDirectory(courier);
  const name = COURIER_NAME[courier];
  return pageMetadata(site, {
    title: `Agencias ${name} en Perú: direcciones y horarios`,
    description: `Las ${dir.agencies.length} agencias de ${name} en ${dir.departments.length} departamentos del Perú, con dirección, horario${courier === 'shalom' ? ', teléfono' : ''} y cómo llegar. Busca la tuya por departamento y ciudad.`,
    path: directoryPath.index(),
  });
}

export default async function AgenciesIndexPage() {
  const brand = await requireBrand(COURIERS);
  const dir = getDirectory(brand.id);
  const name = COURIER_NAME[brand.id];
  const sunday = dir.agencies.filter((a) => a.opensSunday).length;
  const cities = dir.departments
    .flatMap((d) => d.provinces.filter((p) => p.hasPage).map((p) => ({ d, p })))
    .sort((a, b) => b.p.agencies.length - a.p.agencies.length)
    .slice(0, 18);

  return (
    <div className={`${pageContainer} flex flex-col gap-16 py-12`}>
      <PageIntro
        crumbs={<Breadcrumbs items={[{ name: brand.name, path: '/' }, { name: 'Agencias', path: directoryPath.index() }]} />}
        title={`Agencias ${name} en Perú`}
      >
        <p>
          {formatNumber(dir.agencies.length)} agencias de {name} en {dir.departments.length} departamentos, según su catálogo público al{' '}
          {longDate(dir.updatedAt)}. Elige un departamento para ver la dirección, el horario{brand.id === 'shalom' ? ', el teléfono' : ''} y la ruta de
          cada agencia.
          {sunday > 0 && ` ${formatNumber(sunday)} de ellas también atienden los domingos.`}
        </p>
      </PageIntro>

      <section className="grid items-start gap-10 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <DirectoryMap points={dir.agencies} label={`Mapa de las ${dir.agencies.length} agencias de ${name} en el Perú`} />
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold tracking-tight">Agencias por departamento</h2>
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {dir.departments.map((d) => (
              <li key={d.id}>
                <Link
                  href={directoryPath.department(d)}
                  className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] py-3 text-[16px] font-medium transition-colors hover:text-[var(--accent)]"
                >
                  <span>{d.name}</span>
                  <span className="shrink-0 text-sm font-normal text-[var(--muted)]">
                    {d.agencies.length} {d.agencies.length === 1 ? 'agencia' : 'agencias'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <LinkGrid
        title={`Ciudades con más agencias de ${name}`}
        links={cities.map(({ d, p }) => ({ href: directoryPath.province(d, p), label: `${p.name}, ${d.name}`, meta: `${p.agencies.length} agencias` }))}
      />

      <ApiCta
        brand={brand}
        title="Muestra estas agencias en el checkout de tu tienda"
        text={`Con ${brand.name} tu cliente elige la agencia de ${name} donde recoge su pedido: lista por departamento, la más cercana a su ubicación y el costo del envío. Son los mismos datos de esta página, en JSON.`}
        code={`curl "${API_URL}${brand.apiPrefix}/agencies?department=AREQUIPA" \\\n  -H "x-api-key: $MATHYU_API_KEY"`}
      />

      <SourceNote brand={brand} courierName={name} updatedAt={dir.updatedAt} />
    </div>
  );
}
