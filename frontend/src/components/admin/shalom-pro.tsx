import { PRO_HISTORY_DAYS, type ClientShalomPro as ClientShalomProData } from '@/lib/admin';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import { Card } from '@/components/ui/primitives';
import { Empty } from './parts';

/**
 * Cuentas de Shalom Pro del cliente y su historial de conexiones. Las letras salen de una
 * huella del correo de cada cuenta: la misma letra es la misma cuenta. Varias letras en un
 * mismo identificador (default) es un cliente que turna negocios en una sola cuenta.
 */
export function ClientShalomPro({ data, limit }: { data: ClientShalomProData; limit: number }) {
  const turning = data.recentDistinct > limit;
  return (
    <div className="space-y-4">
      <p className={cn('text-sm', turning ? 'font-medium text-red-700' : 'text-[var(--muted)]')}>
        {data.recentDistinct === 0
          ? `Sin conexiones registradas en los últimos ${PRO_HISTORY_DAYS} días (el historial empezó el 25 nov. 2026; las cuentas de antes se registran en su primer cambio).`
          : `${data.recentDistinct} ${data.recentDistinct === 1 ? 'cuenta distinta conectada' : 'cuentas distintas conectadas'} en ${PRO_HISTORY_DAYS} días; su plan permite ${limit} a la vez.`}
        {turning && ' Puede estar turnando negocios en una cuenta en vez de usar el plan Plataforma.'}
      </p>

      <Card className="divide-y divide-[var(--border)] overflow-hidden">
        {data.accounts.length === 0 ? (
          <Empty>Sin cuentas conectadas ahora.</Empty>
        ) : (
          data.accounts.map((a) => (
            <div key={a.ref} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm sm:px-5">
              <span className="font-semibold">{a.label ? `Cuenta ${a.label}` : 'Cuenta'}</span>
              <code className="text-xs text-[var(--muted)]">{a.ref}</code>
              <span className="min-w-0 truncate">{a.email}</span>
              {a.sender && <span className="text-[var(--muted)]">· {a.sender}</span>}
              <span className="ml-auto text-xs text-[var(--muted)]">
                conectada el {formatDate(a.connectedAt)}
                {!a.label && ' · antes del historial'}
              </span>
            </div>
          ))
        )}
      </Card>

      {data.history.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Historial de conexiones</h3>
          <Card className="divide-y divide-[var(--border)] overflow-hidden">
            {data.history.map((h, i) => (
              <div key={`${h.at}-${i}`} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-sm sm:px-5">
                <span className="w-36 shrink-0 text-xs tabular-nums text-[var(--muted)]">{formatDateTime(h.at)}</span>
                <span className={h.action === 'connect' ? '' : 'text-[var(--muted)]'}>{h.action === 'connect' ? 'Conectó' : 'Desconectó'}</span>
                <span className="font-semibold">Cuenta {h.label}</span>
                <code className="text-xs text-[var(--muted)]">{h.ref}</code>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
