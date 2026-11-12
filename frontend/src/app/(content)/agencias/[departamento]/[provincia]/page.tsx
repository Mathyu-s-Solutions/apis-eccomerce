import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getSite, requireBrand } from '@/lib/brand-server';
import {
  COURIER_NAME,
  COURIERS,
  directoryPath,
  findDepartment,
  getDirectory,
  type Agency,
  type CourierId,
  type Directory,
} from '@/lib/directory';
import { pageMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { DirectoryMap } from '@/components/directory/directory-map';
import { AgencyCard, ApiCta, LinkGrid, PageIntro, pageContainer, SourceNote } from '@/components/directory/parts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.mathyu.dev';

type Props = { params: Promise<{ departamento: string; provincia: string }> };

function find(dir: Directory, depSlug: string, provSlug: string) {
  const dep = findDepartment(dir, depSlug);
  const province = dep?.provinces.find((p) => p.slug === provSlug);
  return dep && province ? { dep, province } : null;
}

/** Agencias por distrito, si el snapshot trae el distrito (si no, un solo grupo). */
function byDistrict(agencies: Agency[]): [string, Agency[]][] {
  if (!agencies.some((a) => a.district)) return [['', agencies]];
  const groups = new Map<string, Agency[]>();
  for (const a of agencies) groups.set(a.district || 'Otros', [...(groups.get(a.district || 'Otros') ?? []), a]);
  return [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'es'));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await getSite();
  if (!COURIERS.includes(site.id as CourierId)) return {};
  const courier = site.id as CourierId;
  const dir = getDirectory(courier);
  const { departamento, provincia } = await params;
  const found = find(dir, departamento, provincia);
  if (!found?.province.hasPage) return {};
  const { dep, province } = found;
  const name = COURIER_NAME[courier];
  const n = province.agencies.length;
  return pageMetadata(site, {
    title: `Agencias ${name} en ${province.name}, ${dep.name}: direcciones y horarios`,
    description: `Las ${n} agencias de ${name} en ${province.name} (${dep.name}): ${province.agencies
      .slice(0, 3)
      .map((a) => a.name)
      .join(', ')}${n > 3 ? ' y más' : ''}. Dirección, horario${courier === 'shalom' ? ', teléfono' : ''} y cómo llegar.`,
    path: directoryPath.province(dep, province),
  });
}

export default async function ProvincePage({ params }: Props) {
  const brand = await requireBrand(COURIERS);
  const dir = getDirectory(brand.id);
  const { departamento, provincia } = await params;
  const found = find(dir, departamento, provincia);
  if (!found) notFound();
  const { dep, province } = found;
  // Sin página propia: una sola agencia (va directo a ella) o el departamento tiene una sola provincia.
  if (!province.hasPage) {
    permanentRedirect(province.agencies.length === 1 ? directoryPath.agency(province.agencies[0]) : directoryPath.department(dep));
  }

  const name = COURIER_NAME[brand.id];
  const sunday = province.agencies.filter((a) => a.opensSunday).length;
  const groups = byDistrict(province.agencies);
  const otherProvinces = dep.provinces.filter((p) => p.slug !== province.slug);

  return (
    <div className={`${pageContainer} flex flex-col gap-14 py-12`}>
      <PageIntro
        crumbs={
          <Breadcrumbs
            items={[
              { name: brand.name, path: '/' },
              { name: 'Agencias', path: directoryPath.index() },
              { name: dep.name, path: directoryPath.department(dep) },
              { name: province.name, path: directoryPath.province(dep, province) },
            ]}
          />
        }
        title={`Agencias ${name} en ${province.name}`}
      >
        <p>
          {province.agencies.length} agencias de {name} en la provincia de {province.name}, {dep.name}
          {sunday > 0 ? `; ${sunday === province.agencies.length ? 'todas atienden' : `${sunday} atienden`} también los domingos` : ''}. Revisa la
          dirección, la referencia y el horario de cada una, y abre la ruta en Google Maps.
        </p>
      </PageIntro>

      <div className="grid items-start gap-10 lg:grid-cols-[1fr_minmax(0,340px)]">
        <div className="flex flex-col gap-10">
          {groups.map(([district, agencies]) => (
            <section key={district || 'all'} className="flex flex-col gap-4">
              {district && <h2 className="text-2xl font-bold tracking-tight">{district}</h2>}
              <div className="grid gap-4 md:grid-cols-2">
                {agencies.map((a) => (
                  <AgencyCard key={a.id} agency={a} headingLevel={district ? 'h3' : 'h2'} />
                ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="order-first rounded-3xl border border-[var(--border)] bg-white p-4 lg:sticky lg:top-24 lg:order-none">
          <DirectoryMap
            points={dep.agencies.map((a) => ({ ...a, strong: a.provinceSlug === province.slug }))}
            highlight={dep.id}
            focus
            label={`Mapa de las agencias de ${name} en ${province.name}`}
          />
        </aside>
      </div>

      <ApiCta
        brand={brand}
        title={`La agencia más cercana a tu cliente en ${province.name}, por API`}
        text={`Pasa la ubicación de tu cliente y te devolvemos las agencias de ${name} más cercanas, con distancia y horario, para mostrarlas en tu checkout.`}
        code={`curl "${API_URL}${brand.apiPrefix}/agencies/search?near=${province.agencies[0].lat},${province.agencies[0].lng}&radiusKm=5" \\\n  -H "x-api-key: $MATHYU_API_KEY"`}
      />

      <LinkGrid
        title={`Otras provincias de ${dep.name}`}
        links={otherProvinces.map((p) => ({
          href: p.hasPage ? directoryPath.province(dep, p) : directoryPath.agency(p.agencies[0]),
          label: p.name,
          meta: `${p.agencies.length} ${p.agencies.length === 1 ? 'agencia' : 'agencias'}`,
        }))}
      />

      <SourceNote brand={brand} courierName={name} updatedAt={dir.updatedAt} />
    </div>
  );
}
