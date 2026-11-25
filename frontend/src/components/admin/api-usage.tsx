import Link from 'next/link';
import type { ClientRequests, FailureGroup, RequestFilter, RequestRow } from '@/lib/admin';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import { Card } from '@/components/ui/primitives';
import { ApiName, Empty } from './parts';

/** Registro de requests a la API en el admin (piezas del servidor, sin estado). */

const percent = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : '0%');

/** "25 nov., 00:10:23" en hora de Lima. */
function limaTime(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso));
}

function ms(n: number): string {
  return n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`;
}

/** 2xx en verde, 4xx en ámbar, 429 y 5xx en rojo. */
export function StatusCode({ status }: { status: number }) {
  const tone = status >= 500 || status === 429 ? 'bg-red-50 text-red-700 ring-red-200' : status >= 400 ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-green-50 text-green-700 ring-green-200';
  return <span className={cn('inline-flex min-w-10 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset', tone)}>{status}</span>;
}

/** "POST /v1/shalom/track" */
export function Endpoint({ method, route, className }: { method: string; route: string; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-baseline gap-1.5', className)}>
      <span className="shrink-0 text-[11px] font-semibold text-[var(--muted)]">{method}</span>
      <code className="truncate text-xs">{route}</code>
    </span>
  );
}

/** Enlace a la misma página con otro filtro (se queda en la sección). */
function filterHref(base: string, f: RequestFilter): string {
  const q = new URLSearchParams();
  if (f.route) q.set('route', f.route);
  if (f.errorsOnly) q.set('errors', '1');
  const s = q.toString();
  return `${base}${s ? `?${s}` : ''}#requests`;
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        'inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium',
        active ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--border)] hover:bg-[var(--surface)]',
      )}
    >
      {children}
    </Link>
  );
}

/** Qué endpoints usa el cliente (30 días) y sus últimos requests. */
export function ClientApiUsage({ data, filter, base, days }: { data: ClientRequests; filter: RequestFilter; base: string; days: number }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        {data.total === 0
          ? `Sin requests en los últimos ${days} días.`
          : <>{formatNumber(data.total)} requests en {days} días · <span className={data.errors ? 'font-medium text-red-700' : ''}>{formatNumber(data.errors)} con error ({percent(data.errors, data.total)})</span></>}
      </p>

      {data.endpoints.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                <th scope="col" className="px-4 py-2.5 font-medium">Endpoint</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Requests</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Con error</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Cobradas</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Tiempo medio</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Último</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.endpoints.map((e) => (
                <tr key={`${e.method} ${e.route}`} className="align-top">
                  <td className="max-w-[28rem] px-4 py-2.5">
                    <Link href={filterHref(base, { route: e.route })} scroll={false} className="flex min-w-0 flex-wrap items-center gap-x-2 hover:underline" title="Ver sus requests">
                      <Endpoint method={e.method} route={e.route} />
                      {e.product && <ApiName product={e.product} className="text-xs font-normal text-[var(--muted)]" />}
                    </Link>
                    {e.lastError && (
                      <p className="mt-1 text-xs text-red-700">
                        Último error ({e.lastError.status}, {formatDateTime(e.lastError.at)}): {e.lastError.message ?? 'sin mensaje'}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(e.total)}</td>
                  <td className={cn('px-4 py-2.5 text-right tabular-nums', e.errors ? 'font-medium text-red-700' : 'text-[var(--muted)]')}>
                    {e.errors ? `${formatNumber(e.errors)} (${percent(e.errors, e.total)})` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{e.units ? formatNumber(e.units) : <span className="text-[var(--muted)]">—</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{ms(e.avgMs)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-[var(--muted)]">{formatDateTime(e.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {data.total > 0 && (
        <div id="requests" className="scroll-mt-20 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-1 text-sm font-semibold">Últimos requests</h3>
            <Chip href={filterHref(base, { route: filter.route })} active={!filter.errorsOnly}>Todos</Chip>
            <Chip href={filterHref(base, { route: filter.route, errorsOnly: true })} active={!!filter.errorsOnly}>Solo errores</Chip>
            {filter.route && (
              <Chip href={filterHref(base, { errorsOnly: filter.errorsOnly })} active>
                {filter.route} <span aria-hidden className="ml-1.5">×</span>
                <span className="sr-only">(quitar filtro)</span>
              </Chip>
            )}
          </div>
          <RequestList rows={data.recent} />
        </div>
      )}
    </div>
  );
}

function RequestList({ rows }: { rows: RequestRow[] }) {
  return (
    <Card className="divide-y divide-[var(--border)] overflow-hidden">
      {rows.length === 0 ? (
        <Empty>Ningún request con este filtro.</Empty>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:px-5">
            <span className="w-32 shrink-0 whitespace-nowrap pt-0.5 text-xs tabular-nums text-[var(--muted)]">{limaTime(r.at)}</span>
            <StatusCode status={r.status} />
            <div className="min-w-0 flex-1 basis-60">
              <Endpoint method={r.method} route={r.route} className="max-w-full" />
              {r.error && (
                <p className="mt-0.5 break-words text-xs text-red-700">
                  {r.upstream && <span className="font-medium">[{r.upstream}] </span>}
                  {r.error}
                </p>
              )}
            </div>
            <span className="whitespace-nowrap text-xs tabular-nums text-[var(--muted)]">
              {ms(r.durationMs)}
              {r.units > 0 && ` · ${r.units} ${r.units === 1 ? 'consulta' : 'consultas'}`}
              {` · ${r.keyPrefix}…`}
            </span>
          </div>
        ))
      )}
    </Card>
  );
}

/** Fallas recientes de todos los clientes, agrupadas por endpoint y mensaje. */
export function RecentFailures({ groups, hours }: { groups: FailureGroup[]; hours: number }) {
  return (
    <Card className="divide-y divide-[var(--border)] overflow-hidden">
      {groups.length === 0 ? (
        <Empty>Sin fallas en las últimas {hours} h: ni errores del servidor, ni de los couriers o SUNAT, ni límites por minuto.</Empty>
      ) : (
        groups.map((g) => (
          <div key={`${g.method} ${g.route} ${g.status} ${g.error}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm sm:px-5">
            <StatusCode status={g.status} />
            <div className="min-w-0 flex-1 basis-60">
              <Endpoint method={g.method} route={g.route} className="max-w-full" />
              <p className="mt-0.5 break-words text-xs text-red-700">
                {g.upstream && <span className="font-medium">[{g.upstream}] </span>}
                {g.error ?? 'sin mensaje'}
              </p>
            </div>
            <div className="text-right text-xs text-[var(--muted)]">
              <p className="font-medium text-[var(--foreground)] tabular-nums">
                {formatNumber(g.count)} {g.count === 1 ? 'vez' : 'veces'} · {g.clients} {g.clients === 1 ? 'cliente' : 'clientes'}
              </p>
              <p>
                última {formatDateTime(g.lastAt)}
                {g.lastClient && (
                  <>
                    {' · '}
                    <Link href={`/admin/clients/${g.lastClient.id}?errors=1#requests`} className="text-[var(--accent)] hover:underline">{g.lastClient.name ?? g.lastClient.email}</Link>
                  </>
                )}
              </p>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}
