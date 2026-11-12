import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { getSite, requireBrand } from '@/lib/brand-server';
import {
  COURIER_NAME,
  COURIERS,
  directoryPath,
  findAgency,
  findDepartment,
  formatKm,
  getDirectory,
  nearestAgencies,
  slugify,
  type Agency,
  type CourierId,
} from '@/lib/directory';
import { pageMetadata, type Crumb } from '@/lib/seo';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { DirectoryMap } from '@/components/directory/directory-map';
import { AgencyCard, ApiCta, PageIntro, pageContainer, SourceNote } from '@/components/directory/parts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.mathyu.dev';

type Props = { params: Promise<{ slug: string }> };

/** "Shalom Av Pachacutec (Cusco)": la ciudad, si el nombre de la agencia no la dice. */
function displayName(courier: CourierId, a: Agency): string {
  const withCity = slugify(a.name).includes(a.provinceSlug) ? a.name : `${a.name} (${a.province})`;
  return `${COURIER_NAME[courier]} ${withCity}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await getSite();
  if (!COURIERS.includes(site.id as CourierId)) return {};
  const courier = site.id as CourierId;
  const agency = findAgency(getDirectory(courier), (await params).slug);
  if (!agency) return {};
  const title = `${displayName(courier, agency)}: dirección, horario${agency.phone ? ' y teléfono' : ''}`;
  const parts = [
    `Agencia ${COURIER_NAME[courier]} ${agency.name} en ${agency.address}, ${agency.province} (${agency.department}).`,
    agency.hours.length ? `Horario: ${agency.hours.join(', ')}.` : '',
    agency.phone ? `Teléfono: ${agency.phone}.` : '',
    'Cómo llegar y agencias cercanas.',
  ];
  return pageMetadata(site, { title, description: parts.filter(Boolean).join(' '), path: directoryPath.agency(agency) });
}

export default async function AgencyPage({ params }: Props) {
  const brand = await requireBrand(COURIERS);
  const dir = getDirectory(brand.id);
  const { slug } = await params;
  const agency = findAgency(dir, slug);
  if (!agency) notFound();
  // Si la agencia cambió de nombre, la URL vieja lleva a la nueva.
  if (agency.slug !== slug) permanentRedirect(directoryPath.agency(agency));

  const name = COURIER_NAME[brand.id];
  const dep = findDepartment(dir, agency.departmentSlug)!;
  const province = dep.provinces.find((p) => p.slug === agency.provinceSlug)!;
  const nearest = nearestAgencies(dir, agency, 6);
  const sameCity = province.agencies.filter((a) => a.id !== agency.id && !nearest.some((n) => n.agency.id === a.id)).slice(0, 12);

  const crumbs: Crumb[] = [
    { name: brand.name, path: '/' },
    { name: 'Agencias', path: directoryPath.index() },
    { name: dep.name, path: directoryPath.department(dep) },
    ...(province.hasPage ? [{ name: province.name, path: directoryPath.province(dep, province) }] : []),
    { name: agency.name, path: directoryPath.agency(agency) },
  ];

  return (
    <div className={`${pageContainer} flex flex-col gap-14 py-12`}>
      <PageIntro crumbs={<Breadcrumbs items={crumbs} />} eyebrow={`Agencia de ${name} en ${province.name}, ${dep.name}`} title={displayName(brand.id, agency)}>
        <p>
          Dirección, horario{agency.phone ? ', teléfono' : ''} y ubicación de la agencia {agency.name} de {name}, más las agencias que tiene cerca por si
          esta no te queda a la mano.
        </p>
      </PageIntro>

      <div className="grid items-start gap-10 lg:grid-cols-[1fr_minmax(0,360px)]">
        <div className="flex flex-col gap-10">
          <AgencyCard agency={agency} headingLevel="h2" linkName={false} />

          <section className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold tracking-tight">Agencias de {name} cerca de {agency.name}</h2>
            <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white">
              {nearest.map(({ agency: a, km }) => (
                <li key={a.id} className="flex items-baseline justify-between gap-4 px-5 py-3.5">
                  <span className="min-w-0">
                    <Link href={directoryPath.agency(a)} className="font-semibold hover:text-[var(--accent)]">
                      {a.name}
                    </Link>
                    <span className="block truncate text-sm text-[var(--muted)]">
                      {a.address} · {a.province}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-[var(--muted)]">{formatKm(km)}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-[var(--muted)]">Distancia en línea recta desde esta agencia.</p>
          </section>

          {sameCity.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-bold tracking-tight">Más agencias en {province.name}</h2>
              <ul className="flex flex-wrap gap-2">
                {sameCity.map((a) => (
                  <li key={a.id}>
                    <Link href={directoryPath.agency(a)} className="inline-block rounded-full border border-[var(--border)] bg-white px-3.5 py-1.5 text-sm hover:border-[var(--accent)] hover:text-[var(--accent)]">
                      {a.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="order-first rounded-3xl border border-[var(--border)] bg-white p-4 lg:sticky lg:top-24 lg:order-none">
          <DirectoryMap
            points={[...nearest.map((n) => n.agency), { ...agency, strong: true }]}
            highlight={agency.departmentId}
            focus
            label={`Ubicación de la agencia ${agency.name} de ${name}`}
          />
          <p className="mt-2 text-center text-xs text-[var(--muted)]">
            {agency.lat}, {agency.lng}
          </p>
        </aside>
      </div>

      <ApiCta
        brand={brand}
        title="¿Vendes por internet? Muestra esta agencia en tu checkout"
        text={`Tu cliente comparte su ubicación y le mostramos las agencias de ${name} más cercanas, como esta. Con la misma API cotizas el envío y rastreas el paquete hasta que llega.`}
        code={`curl "${API_URL}${brand.apiPrefix}/agencies/search?near=${agency.lat},${agency.lng}&radiusKm=3" \\\n  -H "x-api-key: $MATHYU_API_KEY"`}
      />

      <SourceNote brand={brand} courierName={name} updatedAt={dir.updatedAt} />
    </div>
  );
}
