import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getSite, requireBrand } from '@/lib/brand-server';
import { COURIER_NAME, COURIERS, directoryPath, findDepartment, getDirectory, longDate, type CourierId, type Department } from '@/lib/directory';
import { pageMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { DirectoryMap } from '@/components/directory/directory-map';
import { ApiCta, LinkGrid, PageIntro, pageContainer, SourceNote } from '@/components/directory/parts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.mathyu.dev';

type Props = { params: Promise<{ departamento: string }> };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Arequipa (24), Camaná (3) y Caylloma (2)" */
function topProvinces(dep: Department, max = 3): string {
  const parts = dep.provinces.slice(0, max).map((p) => `${p.name} (${p.agencies.length})`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}` : parts[0];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await getSite();
  if (!COURIERS.includes(site.id as CourierId)) return {};
  const courier = site.id as CourierId;
  const dir = getDirectory(courier);
  const dep = findDepartment(dir, (await params).departamento);
  if (!dep) return {};
  const name = COURIER_NAME[courier];
  return pageMetadata(site, {
    title: `Agencias ${name} en ${dep.name}: ${plural(dep.agencies.length, 'dirección', 'direcciones')} y horarios`,
    description: `${plural(dep.agencies.length, 'agencia', 'agencias')} de ${name} en ${dep.name}: ${topProvinces(dep)}. Dirección, horario${courier === 'shalom' ? ', teléfono' : ''} y cómo llegar a cada una. Datos al ${longDate(dir.updatedAt)}.`,
    path: directoryPath.department(dep),
  });
}

export default async function DepartmentPage({ params }: Props) {
  const brand = await requireBrand(COURIERS);
  const dir = getDirectory(brand.id);
  const dep = findDepartment(dir, (await params).departamento);
  if (!dep) notFound();
  const name = COURIER_NAME[brand.id];
  const sunday = dep.agencies.filter((a) => a.opensSunday).length;
  const others = dir.departments.filter((d) => d.id !== dep.id);

  return (
    <div className={`${pageContainer} flex flex-col gap-14 py-12`}>
      <PageIntro
        crumbs={
          <Breadcrumbs
            items={[
              { name: brand.name, path: '/' },
              { name: 'Agencias', path: directoryPath.index() },
              { name: dep.name, path: directoryPath.department(dep) },
            ]}
          />
        }
        title={`Agencias ${name} en ${dep.name}`}
      >
        <p>
          En {dep.name} hay {plural(dep.agencies.length, 'agencia', 'agencias')} de {name}
          {dep.provinces.length > 1 ? ` en ${dep.provinces.length} provincias: ${topProvinces(dep)}${dep.provinces.length > 3 ? ', entre otras' : ''}.` : ` en ${dep.provinces[0].name}.`}
          {sunday > 0 && ` ${sunday === dep.agencies.length ? 'Todas atienden' : `${plural(sunday, 'atiende', 'atienden')}`} también los domingos.`}
        </p>
      </PageIntro>

      <div className="grid items-start gap-10 lg:grid-cols-[1fr_minmax(0,360px)]">
        <div className="flex flex-col gap-10">
          {dep.provinces.map((p) => (
            <section key={p.slug} id={p.slug} className="scroll-mt-24">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-[var(--foreground)] pb-2">
                <h2 className="text-2xl font-bold tracking-tight">
                  {p.name} <span className="text-base font-medium text-[var(--muted)]">· {plural(p.agencies.length, 'agencia', 'agencias')}</span>
                </h2>
                {p.hasPage && (
                  <Link href={directoryPath.province(dep, p)} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)] hover:underline">
                    Agencias en {p.name} <ArrowRight size={14} aria-hidden />
                  </Link>
                )}
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {p.agencies.map((a) => (
                  <li key={a.id} className="py-3">
                    <Link href={directoryPath.agency(a)} className="font-semibold hover:text-[var(--accent)]">
                      {a.name}
                    </Link>
                    <p className="text-[15px] text-[var(--muted)]">{a.address}</p>
                    {a.hours.length > 0 && <p className="text-sm text-[var(--muted)]">{a.hours.join(' · ')}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <aside className="order-first rounded-3xl border border-[var(--border)] bg-white p-4 lg:sticky lg:top-24 lg:order-none">
          <DirectoryMap points={dep.agencies} highlight={dep.id} focus label={`Mapa de las agencias de ${name} en ${dep.name}`} />
        </aside>
      </div>

      <ApiCta
        brand={brand}
        title={`¿Envías a ${dep.name}? Deja que tu cliente elija su agencia`}
        text={`Lista las agencias de ${name} por departamento, provincia o distrito, o la más cercana a la ubicación de tu cliente, directo en el checkout de tu tienda.`}
        code={`curl "${API_URL}${brand.apiPrefix}/agencies?department=${encodeURIComponent(dep.id)}" \\\n  -H "x-api-key: $MATHYU_API_KEY"`}
      />

      <LinkGrid
        title={`Agencias de ${name} en otros departamentos`}
        links={others.map((d) => ({ href: directoryPath.department(d), label: d.name, meta: String(d.agencies.length) }))}
      />

      <SourceNote brand={brand} courierName={name} updatedAt={dir.updatedAt} />
    </div>
  );
}
