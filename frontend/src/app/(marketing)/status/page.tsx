import type { Metadata } from 'next';
import { CircleCheck, CircleDashed, CircleX, TriangleAlert, type LucideIcon } from 'lucide-react';
import { getSite } from '@/lib/brand-server';
import { pageMetadata } from '@/lib/seo';
import {
  buildStatus,
  formatMinutes,
  formatUptime,
  groupName,
  groupsFor,
  INCIDENT_DAYS,
  INTERVAL_MINUTES,
  readStatus,
  type ComponentState,
  type Level,
} from '@/lib/status';
import { cn, formatDateTime } from '@/lib/utils';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { SiteLink } from '@/components/site/site-link';
import { PageIntro, pageContainer } from '@/components/directory/parts';
import { UptimeBars } from '@/components/status/uptime-bars';
import { DAY_COLORS } from '@/components/status/day-colors';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  const hub = site.id === 'hub';
  return pageMetadata(site, {
    title: hub ? 'Estado de las APIs' : `Estado de ${site.name}`,
    description: hub
      ? `Estado en vivo de las APIs de Shalom, Olva y SUNAT: la API y cada servicio del que dependen, revisados cada ${INTERVAL_MINUTES} minutos, con 90 días de historial.`
      : `Estado en vivo de ${site.name}: la API y la conexión con ${site.product}, revisadas cada ${INTERVAL_MINUTES} minutos, con 90 días de historial.`,
    path: '/status',
  });
}

const LEVELS: Record<Level, { label: string; icon: LucideIcon; text: string; dot: string; banner: string }> = {
  up: { label: 'Operativo', icon: CircleCheck, text: 'text-emerald-700', dot: 'bg-emerald-500', banner: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  degraded: { label: 'Con demoras', icon: TriangleAlert, text: 'text-amber-700', dot: 'bg-amber-400', banner: 'border-amber-200 bg-amber-50 text-amber-900' },
  down: { label: 'Con fallas', icon: CircleX, text: 'text-red-700', dot: 'bg-red-500', banner: 'border-red-200 bg-red-50 text-red-900' },
  unknown: { label: 'Sin datos', icon: CircleDashed, text: 'text-slate-600', dot: 'bg-slate-300', banner: 'border-slate-200 bg-slate-50 text-slate-800' },
};

const HEADLINES: Record<Level, string> = {
  up: 'Todo funciona con normalidad',
  degraded: 'Algunos servicios responden con demoras',
  down: 'Hay servicios con fallas',
  unknown: 'Sin datos recientes de algunos servicios',
};

function ago(iso: string, now: number): string {
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.floor(min / 60)} h`;
  return `el ${formatDateTime(iso)}`;
}

function latency(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function ComponentRow({ state }: { state: ComponentState }) {
  const { component, level, detail, latencyMs, uptime, days } = state;
  const l = LEVELS[level];
  return (
    <li className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug">{component.name}</h3>
          <p className="mt-0.5 text-sm text-[var(--muted)]">{component.description}</p>
        </div>
        <div className="flex flex-col items-start sm:items-end">
          <span className={cn('inline-flex items-center gap-2 text-sm font-semibold', l.text)}>
            <span className={cn('h-2.5 w-2.5 rounded-full', l.dot)} aria-hidden />
            {l.label}
          </span>
          {detail ? (
            <span className="mt-0.5 text-xs text-[var(--muted)]">{detail}</span>
          ) : (
            latencyMs !== null && <span className="mt-0.5 text-xs text-[var(--muted)]">Responde en {latency(latencyMs)}</span>
          )}
        </div>
      </div>
      <UptimeBars days={days} name={component.name} uptime={uptime === null ? null : formatUptime(uptime)} />
    </li>
  );
}

export default async function StatusPage() {
  const site = await getSite();
  const { checks, health, now } = await readStatus();
  const view = buildStatus(site.id, checks, health, now);
  const overall = LEVELS[view.overall];
  const OverallIcon = overall.icon;
  const affected = view.components.filter((c) => c.level === 'down' || c.level === 'degraded');
  const hub = site.id === 'hub';

  return (
    <div className={`${pageContainer} flex flex-col gap-12 py-12`}>
      <PageIntro
        crumbs={<Breadcrumbs items={[{ name: site.name, path: '/' }, { name: 'Estado', path: '/status' }]} />}
        title={hub ? 'Estado de las APIs' : `Estado de ${site.name}`}
      >
        <p>
          Cada {INTERVAL_MINUTES} minutos probamos la API y {hub ? 'la conexión con Shalom, Olva y SUNAT' : `la conexión con ${site.product}`} con una consulta real, desde
          los mismos servidores que atienden tus requests. Aquí ves cómo están ahora y los últimos 90 días.
        </p>
      </PageIntro>

      <section aria-labelledby="estado-general" className={cn('flex gap-4 rounded-2xl border p-5 sm:p-6', overall.banner)}>
        <OverallIcon size={30} className="mt-0.5 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 id="estado-general" className="text-xl font-bold tracking-tight sm:text-2xl">
            {view.noHistory ? 'No pudimos leer el historial de chequeos' : HEADLINES[view.overall]}
          </h2>
          {affected.length > 0 && (
            <ul className="space-y-0.5 text-[15px]">
              {affected.map((c) => (
                <li key={c.component.id}>
                  <strong>{groupName(c.component.group)} · {c.component.name}</strong>
                  {c.detail && `: ${c.detail}`}
                </li>
              ))}
            </ul>
          )}
          {affected.some((c) => c.component.group !== 'platform') && (
            <p className="text-sm opacity-90">Cuando un proveedor no responde, la API devuelve 502 o 504 y esa consulta no se descuenta de tu cuota.</p>
          )}
          <p className="text-sm opacity-80">
            {view.lastCheckAt
              ? `Última revisión ${ago(view.lastCheckAt, now)} (${formatDateTime(view.lastCheckAt)}, hora de Lima).`
              : view.noHistory
                ? `La API ${health.ok ? 'responde' : 'no responde'} ahora; el resto se verá cuando vuelva el historial.`
                : `Todavía no hay chequeos guardados: el primero llega en los próximos ${INTERVAL_MINUTES} minutos.`}
          </p>
        </div>
      </section>

      {groupsFor(site.id).map((group) => {
        const rows = view.components.filter((c) => c.component.group === group);
        return (
          <section key={group} className="flex flex-col gap-4" aria-labelledby={`grupo-${group}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id={`grupo-${group}`} className="text-2xl font-bold tracking-tight">
                {groupName(group)}
              </h2>
              {hub && group !== 'platform' && (
                <SiteLink site={group} className="text-sm font-medium text-[var(--accent)] hover:underline">
                  Ver la API
                </SiteLink>
              )}
            </div>
            <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white">
              {rows.map((c) => (
                <ComponentRow key={c.component.id} state={c} />
              ))}
            </ul>
          </section>
        );
      })}

      <section className="flex flex-col gap-4" aria-labelledby="incidentes">
        <h2 id="incidentes" className="text-2xl font-bold tracking-tight">
          Incidentes recientes
        </h2>
        {view.incidents.length === 0 ? (
          <p className="rounded-2xl border border-[var(--border)] bg-white p-5 text-[var(--muted)]">
            {view.noHistory ? 'Sin historial por ahora.' : `Sin caídas en los últimos ${INCIDENT_DAYS} días.`}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white">
            {view.incidents.map((i) => (
              <li key={`${i.component.id}-${i.start}`} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 p-5">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {groupName(i.component.group)} · {i.component.name}
                  </p>
                  {i.detail && <p className="mt-0.5 text-sm text-[var(--muted)]">{i.detail}</p>}
                </div>
                <div className="flex flex-col items-start text-sm sm:items-end">
                  <span className={cn('font-semibold', i.end ? 'text-[var(--muted)]' : 'text-red-700')}>{i.end ? 'Resuelto' : 'En curso'}</span>
                  <span className="text-[var(--muted)]">
                    {formatDateTime(i.start)} · {i.end ? `duró ~${formatMinutes(i.minutes)}` : `hace ~${formatMinutes(i.minutes)}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-8 md:grid-cols-3">
        <div>
          <h2 className="text-lg font-bold">¿Qué revisamos?</h2>
          <p className="mt-2 leading-relaxed text-[var(--muted)]">
            Una consulta real y liviana a cada servicio, sin captcha ni cuota: una guía que no existe, una cotización, el servicio de comprobantes de SUNAT… Si
            falla, se reintenta una vez antes de contarla como caída.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-bold">¿Qué significa cada color?</h2>
          <ul className="mt-2 space-y-1.5 leading-relaxed text-[var(--muted)]">
            {(
              [
                ['up', 'Sin fallas en el día.'],
                ['minor', 'Fallas breves o demoras.'],
                ['major', 'Caídas que suman media hora o más.'],
                ['none', 'Sin datos.'],
              ] as const
            ).map(([level, text]) => (
              <li key={level} className="flex items-start gap-2.5">
                <span className={cn('mt-1.5 h-3 w-3 shrink-0 rounded-[3px]', DAY_COLORS[level])} aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-bold">¿Y si falla un proveedor?</h2>
          <p className="mt-2 leading-relaxed text-[var(--muted)]">
            Si {hub ? 'Shalom, Olva o SUNAT no responden' : `${site.product} no responde`}, la API devuelve
            502 o 504 y esa consulta no se cobra: solo se descuentan las respuestas exitosas.
          </p>
        </div>
      </section>

      {!hub && (
        <p className="text-sm text-[var(--muted)]">
          <SiteLink site="hub" path="/status" className="font-medium text-[var(--accent)] hover:underline">
            Ver el estado de todas las APIs
          </SiteLink>
        </p>
      )}
    </div>
  );
}
