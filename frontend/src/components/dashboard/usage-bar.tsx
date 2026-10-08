import { formatNumber } from '@/lib/utils';

export function UsageBar({ used, limit }: { used: number; limit: number | null }) {
  const pct = limit === null || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const near = pct >= 80;

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{formatNumber(used)} <span className="text-[var(--muted)]">{used === 1 ? 'consulta' : 'consultas'}</span></span>
        <span className="text-[var(--muted)]">{limit === null ? 'Ilimitado' : `de ${formatNumber(limit)}`}</span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface)]">
        <div
          className={`h-full rounded-full ${near ? 'bg-amber-500' : ''}`}
          style={{ width: `${limit === null ? 6 : pct}%`, backgroundColor: near ? undefined : 'var(--accent)' }}
        />
      </div>
      {limit !== null && (
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          {pct}% usado{near ? ' — considera subir de plan' : ''}
        </p>
      )}
    </div>
  );
}
