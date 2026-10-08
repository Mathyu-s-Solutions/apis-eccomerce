import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Brand } from '@/lib/brands';
import { agencyStats } from '@/lib/agency-stats';
import { cn } from '@/lib/utils';
import { AgencyMap } from './agency-map';
import { BatchRoutes } from './batch-routes';
import { CountUp, Marquee, Reveal, Stagger } from './motion';
import { QuoteBuilder } from './quote-builder';
import { ParcelsScene } from './scenes';
import { container, CtaBand, DISPLAY, Features, Pricing, SectionHeading, Steps } from './sections';

export function OlvaLanding({ brand, apiUrl }: { brand: Brand; apiUrl: string }) {
  const stats = agencyStats('olva');

  return (
    <>
      <section className="relative overflow-hidden bg-[var(--signature)] text-[#020617]">
        <div className={cn(container, 'flex flex-wrap items-center gap-8 pb-[72px] pt-16')}>
          <Stagger className="flex min-w-0 flex-[1_1_500px] flex-col gap-6">
            <span className="inline-flex items-center gap-2 self-start rounded-full bg-[#020617] px-3.5 py-1.5 text-sm font-semibold text-[var(--signature)]">
              <span className="h-2 w-2 rounded-full bg-[var(--signature)]" /> Tracking · Agencias · Ubigeos · Cotización
            </span>
            <h1 className={cn('text-[clamp(44px,6.4vw,84px)] leading-[0.98]', DISPLAY.olva)}>{brand.heroTitle}</h1>
            <p className="max-w-xl text-[19px] leading-relaxed text-[#2A2410]">{brand.heroSubtitle}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2.5 rounded-xl bg-[#020617] px-6 py-4 text-[17px] font-semibold text-white transition hover:-translate-y-px hover:bg-[#1E293B]"
              >
                Crear mi API key <ArrowRight size={20} />
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center rounded-xl border-2 border-[#020617] px-[22px] py-3.5 text-[17px] font-semibold transition-colors hover:bg-[#020617] hover:text-[var(--signature)]"
              >
                Ver documentación
              </Link>
            </div>
            <dl className="mt-2 grid max-w-xl grid-cols-3 gap-4 border-t-2 border-[#020617] pt-6">
              <Stat value={stats.total} label="oficinas en el catálogo" />
              <Stat value={50} label="guías por llamada en lote" />
              <Stat value={stats.departments} label="departamentos con cobertura" />
            </dl>
          </Stagger>

          <div className="relative flex h-[480px] min-w-0 flex-[1_1_460px] items-center justify-center md:h-[600px]">
            <div aria-hidden className="absolute aspect-square w-[min(520px,92%)] rounded-full bg-[#020617]" />
            <svg aria-hidden viewBox="0 0 200 200" className="spin-slow absolute aspect-square w-[min(580px,100%)]">
              <defs>
                <path id="olva-ring" d="M100 100m-92 0a92 92 0 1 1 184 0a92 92 0 1 1-184 0" />
              </defs>
              <text className="fill-[#020617] text-[9px] font-bold tracking-[3px]">
                <textPath href="#olva-ring">RASTREO · AGENCIAS · UBIGEOS · COTIZACIÓN · RASTREO EN LOTE · WEBHOOKS ·</textPath>
              </text>
            </svg>
            <ParcelsScene />
            <div className="absolute bottom-10 right-[4%] flex flex-col gap-1 rounded-[14px] bg-white px-4 py-3 shadow-[0_20px_40px_-18px_rgba(2,6,23,.5)]">
              <span className="font-mono text-xs text-[#475569]">POST {brand.apiPrefix}/track/batch</span>
              <span className="font-bold">Hasta 50 guías, 1 consulta</span>
            </div>
          </div>
        </div>
      </section>

      <Marquee
        className="bg-[#020617] py-[18px] text-[22px] font-extrabold tracking-tight text-[var(--signature)]"
        separator="●"
        items={['Rastreo de envíos', 'Rastreo en lote', 'Agencias y ubigeos', 'Cotización por ubigeo', 'Tu propia cuota', 'Pagos con Yape o Plin']}
      />

      <section id="lote" className="bg-white py-24">
        <div className={cn(container, 'flex flex-wrap items-center gap-12')}>
          <Reveal className="min-w-0 flex-[1_1_360px]">
            <SectionHeading
              brand={brand}
              eyebrow="Rastreo en lote"
              title="Todas tus guías en una sola llamada"
              intro="Manda hasta 50 guías y recibe el historial de eventos normalizado de cada una. Ideal para actualizar los pedidos de tu tienda en bloque."
            />
            <pre className="code-scroll mt-6 overflow-x-auto whitespace-pre rounded-[14px] bg-[#020617] px-5 py-[18px] font-mono text-[13.5px] leading-7 text-[#E2E8F0]">
              <span className="text-[var(--signature)]">POST</span> {brand.apiPrefix}/track/batch{'\n'}
              {'{ '}
              <span className="text-[#93C5FD]">&quot;items&quot;</span>: [{'\n  { '}
              <span className="text-[#93C5FD]">&quot;orderNumber&quot;</span>: <span className="text-[#FDE68A]">&quot;[N° DE GUÍA]&quot;</span>,{' '}
              <span className="text-[#93C5FD]">&quot;orderCode&quot;</span>: <span className="text-[#FDE68A]">&quot;[EMISIÓN]&quot;</span>
              {' },\n  …\n] }'}
            </pre>
          </Reveal>
          <Reveal className="min-w-0 flex-[1_1_600px]">
            <div className="rounded-[22px] border border-[#E2E8F0] bg-[#F8FAFC] p-5">
              <BatchRoutes />
            </div>
          </Reveal>
        </div>
      </section>

      <section id="cotizar" className="bg-[var(--tint)] py-24">
        <div className={cn(container, 'flex flex-col gap-9')}>
          <Reveal>
            <SectionHeading
              brand={brand}
              eyebrow="Cotización por ubigeo"
              title="Arma tu cotización y copia la llamada"
              intro="Elige origen, destino y peso. Te mostramos la petición exacta que harías a la API."
            />
          </Reveal>
          <Reveal>
            <QuoteBuilder apiUrl={apiUrl} />
          </Reveal>
        </div>
      </section>

      <section id="agencias" className="bg-[#020617] py-24 text-[#F1F5F9]">
        <div className={cn(container, 'flex flex-col gap-6')}>
          <Reveal>
            <SectionHeading
              brand={brand}
              dark
              eyebrow="Mapa de oficinas"
              title="Todas las oficinas de Olva, en un mapa"
              intro="Toca un departamento, busca un distrito o elige una oficina para ver su horario y la ruta. Son los mismos datos del endpoint de agencias."
            />
          </Reveal>
          <Reveal>
            <AgencyMap brand="olva" tone="dark" noun="oficina" apiPrefix={brand.apiPrefix} />
          </Reveal>
        </div>
      </section>

      <Features brand={brand} title="Todo Olva, sin pelearte con su web" />
      <Steps brand={brand} />
      <Pricing brand={brand} title="Paga solo por lo que usas" />
      <CtaBand brand={brand} title="¿Listo para integrar Olva?" text="Crea tu cuenta gratis y obtén una API key al instante. Sin tarjeta." />
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="order-2 text-sm text-[#2A2410]">{label}</dt>
      <dd className="text-[38px] font-black tracking-[-0.04em]">
        <CountUp value={value} />
      </dd>
    </div>
  );
}
