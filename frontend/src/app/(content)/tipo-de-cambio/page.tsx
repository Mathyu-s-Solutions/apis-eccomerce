import type { Metadata } from 'next';
import Link from 'next/link';
import { getSite, requireBrand } from '@/lib/brand-server';
import { formatDay, formatRate, latestRates, limaToday, periodLabel, allPeriods } from '@/lib/exchange-rate';
import { pageMetadata } from '@/lib/seo';
import { Breadcrumbs } from '@/components/site/breadcrumbs';
import { ApiCta, PageIntro, pageContainer } from '@/components/directory/parts';
import { exchangePath, ExchangeSourceNote, MonthArchive, RateStat, RateTable } from '@/components/sunat/exchange';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.mathyu.dev';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  if (site.id !== 'sunat') return {};
  let description = 'Tipo de cambio SBS del dólar y del euro, compra y venta, día por día y por mes desde 2015. También por API, gratis.';
  try {
    const last = (await latestRates()).at(-1);
    if (last) {
      description = `Tipo de cambio SBS del ${formatDay(last.date)}: dólar compra S/ ${formatRate(last.usdBuy)} y venta S/ ${formatRate(last.usdSell)}; euro compra S/ ${formatRate(last.eurBuy)} y venta S/ ${formatRate(last.eurSell)}. Historial diario y por mes.`;
    }
  } catch {
    // Sin el BCRP queda la descripción genérica; la página igual intenta cargar.
  }
  return pageMetadata(site, { title: 'Tipo de cambio SBS hoy: dólar y euro, compra y venta', description, path: exchangePath() });
}

export default async function ExchangeTodayPage() {
  const brand = await requireBrand(['sunat']);
  const rates = await latestRates();
  const today = limaToday();
  const last = rates.at(-1);
  const prev = rates.at(-2);
  const recentMonths = allPeriods().slice(0, 6);

  return (
    <div className={`${pageContainer} flex flex-col gap-14 py-12`}>
      <PageIntro
        crumbs={<Breadcrumbs items={[{ name: brand.name, path: '/' }, { name: 'Tipo de cambio', path: exchangePath() }]} />}
        title="Tipo de cambio SBS hoy"
      >
        {last ? (
          <p>
            Compra y venta del dólar del sistema bancario que publica la SBS, y del euro, al <strong className="text-[var(--foreground)]">{formatDay(last.date, true)}</strong>.
            {last.date !== today &&
              ` Hoy ${formatDay(today, true)} no hay una cotización nueva (fin de semana, feriado o aún no se publica): se usa la del último día hábil.`}{' '}
            Se actualiza sola cada día hábil.
          </p>
        ) : (
          <p>El BCRP no tiene cotizaciones publicadas para los últimos días. Vuelve a intentarlo en unos minutos.</p>
        )}
      </PageIntro>

      {last && (
        <section aria-label="Cotización del día" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RateStat label="Dólar · compra" value={last.usdBuy} previous={prev?.usdBuy} />
          <RateStat label="Dólar · venta" value={last.usdSell} previous={prev?.usdSell} />
          <RateStat label="Euro · compra" value={last.eurBuy} previous={prev?.eurBuy} />
          <RateStat label="Euro · venta" value={last.eurSell} previous={prev?.eurSell} />
        </section>
      )}

      {rates.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl font-bold tracking-tight">Últimos días hábiles</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {recentMonths.map((p) => (
                <Link key={`${p.year}-${p.month}`} href={exchangePath(p.year, p.month)} className="font-medium text-[var(--accent)] hover:underline">
                  {periodLabel(p.year, p.month)}
                </Link>
              ))}
            </div>
          </div>
          <RateTable rates={rates.slice(-20)} caption="Tipo de cambio de los últimos 20 días hábiles" />
        </section>
      )}

      <section className="grid gap-8 md:grid-cols-3">
        <div>
          <h2 className="text-lg font-bold">¿De dónde sale?</h2>
          <p className="mt-2 leading-relaxed text-[var(--muted)]">
            El dólar es el tipo de cambio del sistema bancario que publica la Superintendencia de Banca, Seguros y AFP (SBS); el euro, la serie del BCRP. Ambos
            se toman de la API de estadísticas del Banco Central de Reserva del Perú.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-bold">¿Y los fines de semana?</h2>
          <p className="mt-2 leading-relaxed text-[var(--muted)]">
            Sábados, domingos y feriados no hay cotización nueva. Para esos días se toma la del último día hábil anterior, que es lo que devuelve la API cuando
            pides una de esas fechas.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-bold">¿Lo necesitas en tu sistema?</h2>
          <p className="mt-2 leading-relaxed text-[var(--muted)]">
            Para facturar en dólares necesitas el tipo de cambio del día. Con la API lo pides por fecha y te llega en JSON, gratis en todos los planes.
          </p>
        </div>
      </section>

      <ApiCta
        brand={brand}
        title="El tipo de cambio de cualquier fecha, por API"
        text="Consúltalo desde tu sistema de facturación o tu ERP: compra y venta del dólar y del euro por fecha, con el último día hábil si cae en feriado. Y con la misma cuenta emites facturas y boletas electrónicas."
        code={`curl "${API_URL}${brand.apiPrefix}/exchange-rate?date=${last?.date ?? today}" \\\n  -H "x-api-key: $MATHYU_API_KEY"`}
      />

      <MonthArchive />
      <ExchangeSourceNote />
    </div>
  );
}
