import Link from 'next/link';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { allPeriods, formatDay, formatRate, MONTHS, periodSlug, type DayRate } from '@/lib/exchange-rate';
import { cn } from '@/lib/utils';

export const exchangePath = (year?: number, month?: number) => (year && month ? `/tipo-de-cambio/${periodSlug(year, month)}` : '/tipo-de-cambio');

/** Tabla día por día: dólar y euro, compra y venta. */
export function RateTable({ rates, caption, order = 'desc' }: { rates: DayRate[]; caption: string; order?: 'asc' | 'desc' }) {
  const rows = order === 'desc' ? [...rates].reverse() : rates;
  const th = 'px-4 py-3 font-semibold';
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
      <table className="w-full min-w-[560px] text-[15px] tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-[var(--surface)] text-left text-sm">
            <th scope="col" className={th}>Fecha</th>
            <th scope="col" className={cn(th, 'text-right')}>Dólar compra</th>
            <th scope="col" className={cn(th, 'text-right')}>Dólar venta</th>
            <th scope="col" className={cn(th, 'text-right')}>Euro compra</th>
            <th scope="col" className={cn(th, 'text-right')}>Euro venta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((r) => (
            <tr key={r.date}>
              <th scope="row" className="px-4 py-2.5 text-left font-normal">
                <time dateTime={r.date}>{formatDay(r.date, true)}</time>
              </th>
              <td className="px-4 py-2.5 text-right font-semibold">{formatRate(r.usdBuy)}</td>
              <td className="px-4 py-2.5 text-right font-semibold">{formatRate(r.usdSell)}</td>
              <td className="px-4 py-2.5 text-right text-[var(--muted)]">{formatRate(r.eurBuy)}</td>
              <td className="px-4 py-2.5 text-right text-[var(--muted)]">{formatRate(r.eurSell)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Una cifra grande con su variación frente al día anterior. */
export function RateStat({ label, value, previous, hint }: { label: string; value: number | null; previous?: number | null; hint?: string }) {
  const delta = value !== null && previous != null ? value - previous : null;
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-[var(--border)] bg-white p-5">
      <span className="text-sm font-medium text-[var(--muted)]">{label}</span>
      <span className="text-4xl font-black tabular-nums tracking-tight">
        <span className="mr-1 text-xl font-bold text-[var(--muted)]">S/</span>
        {formatRate(value)}
      </span>
      {delta !== null && Math.abs(delta) >= 0.0005 ? (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--muted)]">
          {delta > 0 ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
          {delta > 0 ? '+' : '−'}
          {Math.abs(delta).toFixed(3)} vs. el día anterior
        </span>
      ) : delta !== null ? (
        <span className="text-sm text-[var(--muted)]">Igual que el día anterior</span>
      ) : hint ? (
        <span className="text-sm text-[var(--muted)]">{hint}</span>
      ) : null}
    </div>
  );
}

/** Links a todos los meses, agrupados por año: el archivo completo. */
export function MonthArchive({ current }: { current?: { year: number; month: number } }) {
  const years = new Map<number, number[]>();
  for (const p of allPeriods()) years.set(p.year, [...(years.get(p.year) ?? []), p.month]);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold tracking-tight">Tipo de cambio por mes</h2>
      <div className="flex flex-col divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white">
        {[...years].map(([year, months]) => (
          <div key={year} className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-5 py-3">
            <span className="w-12 font-bold">{year}</span>
            {[...months].reverse().map((m) => {
              const on = current?.year === year && current.month === m;
              return (
                <Link
                  key={m}
                  href={exchangePath(year, m)}
                  aria-current={on ? 'page' : undefined}
                  className={cn('text-sm capitalize hover:text-[var(--accent)]', on ? 'font-bold text-[var(--accent)]' : 'text-[var(--muted)]')}
                >
                  {MONTHS[m - 1].slice(0, 3)}
                  <span className="sr-only"> {year}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Aviso de fuente para las páginas de SUNAT. */
export function ExchangeSourceNote() {
  return (
    <p className="rounded-xl bg-[var(--surface)] px-4 py-3 text-sm leading-relaxed text-[var(--muted)]">
      Fuente: series diarias del Banco Central de Reserva del Perú (BCRP): «TC Sistema bancario SBS» para el dólar y «TC Euro» para el euro. Solo hay
      cotización los días hábiles. SUNAT API es un servicio independiente de Mathyu&apos;s Solutions: no somos la SUNAT, la SBS ni el BCRP.
    </p>
  );
}
