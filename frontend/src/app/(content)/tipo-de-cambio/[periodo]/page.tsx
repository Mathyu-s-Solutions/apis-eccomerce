import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { getSite, requireBrand } from '@/lib/brand-server';
import { formatDay, formatRate, limaToday, monthRates, parsePeriod, periodInRange, periodLabel, periodSlug, summarize } from '@/lib/exchange-rate';
import { pageMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { ApiCta, PageIntro, pageContainer } from '@/components/directory/parts';
import { exchangePath, ExchangeSourceNote, MonthArchive, RateStat, RateTable } from '@/components/sunat/exchange';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.mathyu.dev';

type Props = { params: Promise<{ periodo: string }> };

function isCurrent(year: number, month: number): boolean {
  const [ty, tm] = limaToday().split('-').map(Number);
  return year === ty && month === tm;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await getSite();
  if (site.id !== 'sunat') return {};
  const p = parsePeriod((await params).periodo);
  if (!p || !periodInRange(p.year, p.month)) return {};
  const label = periodLabel(p.year, p.month);
  let description = `Tipo de cambio SBS del dólar y del euro de ${label}, compra y venta, día por día. Promedio, mínimo y máximo del mes.`;
  try {
    const s = summarize(await monthRates(p.year, p.month));
    if (s) {
      description = `Tipo de cambio SBS de ${label}: el dólar ${isCurrent(p.year, p.month) ? 'va en' : 'cerró en'} S/ ${formatRate(s.last.usdBuy)} compra y S/ ${formatRate(
        s.last.usdSell,
      )} venta (${formatDay(s.last.date)}). Promedio del mes: S/ ${formatRate(s.avgBuy)} compra y S/ ${formatRate(s.avgSell)} venta. Tabla diaria con el euro.`;
    }
  } catch {
    // Descripción genérica si el BCRP no responde.
  }
  return pageMetadata(site, { title: `Tipo de cambio SBS ${label}: dólar y euro día por día`, description, path: exchangePath(p.year, p.month) });
}

export default async function ExchangeMonthPage({ params }: Props) {
  const brand = await requireBrand(['sunat']);
  const { periodo } = await params;
  const p = parsePeriod(periodo);
  if (!p || !periodInRange(p.year, p.month)) notFound();
  if (periodo !== periodSlug(p.year, p.month)) permanentRedirect(exchangePath(p.year, p.month));

  const { year, month } = p;
  const label = periodLabel(year, month);
  const rates = await monthRates(year, month);
  const s = summarize(rates);
  const current = isCurrent(year, month);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  return (
    <div className={`${pageContainer} flex flex-col gap-14 py-12`}>
      <PageIntro
        crumbs={
          <Breadcrumbs
            items={[
              { name: brand.name, path: '/' },
              { name: 'Tipo de cambio', path: exchangePath() },
              { name: `${label.charAt(0).toUpperCase()}${label.slice(1)}`, path: exchangePath(year, month) },
            ]}
          />
        }
        title={`Tipo de cambio SBS de ${label}`}
      >
        {s ? (
          <p>
            {s.days} días hábiles con cotización{current ? ' en lo que va del mes' : ''}. El dólar {current ? 'va en' : 'cerró el mes en'} S/{' '}
            {formatRate(s.last.usdBuy)} compra y S/ {formatRate(s.last.usdSell)} venta ({formatDay(s.last.date)}); en promedio estuvo en S/ {formatRate(s.avgBuy)}{' '}
            compra y S/ {formatRate(s.avgSell)} venta. La venta más baja fue S/ {formatRate(s.minSell.usdSell)} ({formatDay(s.minSell.date)}) y la más alta, S/{' '}
            {formatRate(s.maxSell.usdSell)} ({formatDay(s.maxSell.date)}).
          </p>
        ) : (
          <p>Todavía no hay cotizaciones publicadas en {label}.</p>
        )}
      </PageIntro>

      {s && (
        <section aria-label="Resumen del mes" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RateStat label="Dólar · promedio compra" value={s.avgBuy} hint={`${s.days} días hábiles`} />
          <RateStat label="Dólar · promedio venta" value={s.avgSell} hint={`${s.days} días hábiles`} />
          <RateStat label={current ? 'Dólar · venta más reciente' : 'Dólar · venta al cierre'} value={s.last.usdSell} hint={formatDay(s.last.date)} />
          <RateStat label="Dólar · venta mín. / máx." value={s.minSell.usdSell} hint={`Máximo: S/ ${formatRate(s.maxSell.usdSell)}`} />
        </section>
      )}

      {rates.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold tracking-tight">Tipo de cambio día por día</h2>
          <RateTable rates={rates} order="asc" caption={`Tipo de cambio de cada día hábil de ${label}`} />
        </section>
      )}

      <nav aria-label="Otros meses" className="flex flex-wrap justify-between gap-4 text-[15px] font-semibold">
        {periodInRange(prev.year, prev.month) ? (
          <Link href={exchangePath(prev.year, prev.month)} className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline">
            <ArrowLeft size={16} aria-hidden /> {periodLabel(prev.year, prev.month)}
          </Link>
        ) : (
          <span />
        )}
        {periodInRange(next.year, next.month) ? (
          <Link href={exchangePath(next.year, next.month)} className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline">
            {periodLabel(next.year, next.month)} <ArrowRight size={16} aria-hidden />
          </Link>
        ) : (
          <Link href={exchangePath()} className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline">
            Tipo de cambio de hoy <ArrowRight size={16} aria-hidden />
          </Link>
        )}
      </nav>

      <ApiCta
        brand={brand}
        title="Pídelo por fecha desde tu sistema"
        text="Si emites comprobantes en dólares o cierras el mes en tu ERP, consulta el tipo de cambio de cualquier fecha por API. Gratis en todos los planes."
        code={`curl "${API_URL}${brand.apiPrefix}/exchange-rate?date=${s?.last.date ?? `${year}-${String(month).padStart(2, '0')}-01`}" \\\n  -H "x-api-key: $MATHYU_API_KEY"`}
      />

      <MonthArchive current={{ year, month }} />
      <ExchangeSourceNote />
    </div>
  );
}
