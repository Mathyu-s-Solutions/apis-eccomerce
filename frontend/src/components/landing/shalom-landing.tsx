import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import type { Brand } from '@/lib/brands';
import { agencyStats } from '@/lib/agency-stats';
import { cn } from '@/lib/utils';
import { panelHref } from '@/lib/urls';
import { freePlan } from '@/lib/plans';
import { AgencyMap } from './agency-map';
import { CodeTabs } from './code-tabs';
import { CountUp, Marquee, Reveal, Stagger } from './motion';
import { PeruScene } from './scenes';
import { container, CtaBand, DISPLAY, Features, Pricing, SectionHeading, Steps } from './sections';
import { TrackDemo } from './track-demo';

const k = (s: string) => <span className="text-[#A9C8FF]">{s}</span>;
const str = (s: string) => <span className="text-[#9FE0C4]">{s}</span>;
const num = (s: string) => <span className="text-[#FF8A8D]">{s}</span>;

export function ShalomLanding({ brand, apiUrl }: { brand: Brand; apiUrl: string }) {
  const stats = agencyStats('shalom');

  return (
    <>
      <section className="grid-lines relative overflow-hidden bg-[var(--dark)] text-white">
        <div className={cn(container, 'flex flex-wrap items-center gap-10 pb-16 pt-[72px]')}>
          <Stagger className="flex min-w-0 flex-[1_1_480px] flex-col gap-6">
            <span className="inline-flex items-center gap-2 self-start rounded-full border border-white/20 py-1.5 pl-2 pr-3.5 text-sm text-[var(--tint)]">
              <span className="whitespace-nowrap rounded-full bg-[var(--signature)] px-2.5 py-0.5 text-xs font-semibold text-white">API REST</span>
              Rastreo, agencias y webhooks de Shalom
            </span>
            <h1 className={cn('text-[clamp(40px,5.2vw,66px)] leading-[1.04]', DISPLAY.shalom)}>
              {brand.heroTitle} <span className="text-[var(--signature)]">en una sola API</span>
            </h1>
            <p className="max-w-xl text-[19px] leading-relaxed text-[var(--on-dark-muted)]">{brand.heroSubtitle}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={panelHref('/register')}
                className="inline-flex items-center gap-2.5 rounded-xl bg-[var(--primary)] px-6 py-4 text-[17px] font-semibold text-white transition hover:-translate-y-px hover:bg-[var(--primary-hover)]"
              >
                Crear mi API key <ArrowRight size={20} />
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center rounded-xl border-[1.5px] border-white/40 px-[22px] py-[15px] text-[17px] font-semibold transition-colors hover:bg-white/10"
              >
                Ver documentación
              </Link>
            </div>
            <p className="text-[15px] text-[#A9B1D3]">Empieza gratis con {freePlan('shalom').monthlyLimit} consultas al mes para probar. Paga con Yape o Plin cuando necesites más.</p>
            <dl className="mt-2 grid max-w-xl grid-cols-3 gap-4 border-t border-white/15 pt-6">
              <Stat value={stats.total} label="agencias en el catálogo" />
              <Stat value={stats.departments} label="departamentos con cobertura" />
              <Stat value={5} label="estados normalizados de envío" />
            </dl>
          </Stagger>

          <div className="relative h-[480px] min-w-0 flex-[1_1_520px] md:h-[600px]">
            <PeruScene />
            <span className="absolute right-0 top-3 flex items-center gap-2 rounded-full border border-white/10 bg-[var(--darker)]/85 px-3 py-2 text-[13px] text-[var(--on-dark-muted)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--signature)]" /> Cada barra es una agencia real
            </span>
            <div className="absolute bottom-2 left-0 hidden sm:block">
              <TrackDemo endpoint={`${brand.apiPrefix}/track`} />
            </div>
          </div>
        </div>
      </section>

      <Marquee
        className="bg-[var(--signature)] py-4 text-[17px] font-semibold text-white"
        items={stats.byDepartment.slice(0, 16).map(([d, n], i) => `${d} · ${n}${i === 0 ? ' agencias' : ''}`)}
      />

      <section id="agencias" className="bg-[var(--section)] py-24">
        <div className={cn(container, 'flex flex-col gap-6')}>
          <Reveal>
            <SectionHeading
              brand={brand}
              eyebrow="Mapa de agencias"
              title="Encuentra cualquier agencia Shalom del Perú"
              intro="Filtra por departamento, busca por distrito o dirección y abre la ruta en Google Maps. Este mapa usa los mismos datos que devuelve el endpoint de agencias."
            />
          </Reveal>
          <Reveal>
            <AgencyMap brand="shalom" tone="light" noun="agencia" apiPrefix={brand.apiPrefix} />
          </Reveal>
        </div>
      </section>

      <section id="rastreo" className="bg-white py-24">
        <div className={cn(container, 'flex flex-wrap items-center gap-14')}>
          <Reveal className="min-w-0 flex-[1_1_400px]">
            <SectionHeading
              brand={brand}
              eyebrow="Pruébalo en segundos"
              title="Una llamada, una respuesta clara"
              intro={
                <>
                  Envía tu key en el header{' '}
                  <code className="rounded-md bg-[var(--tint)] px-1.5 py-0.5 font-mono text-[var(--dark)]">x-api-key</code> y recibe estados
                  normalizados, listos para mostrar en tu tienda.
                </>
              }
            />
            <ul className="mt-6 flex flex-col gap-3">
              {[
                'Rastreo por número de guía y clave, o por id interno',
                'Estados comunes: REGISTERED, IN_TRANSIT, AT_DESTINATION, OUT_FOR_DELIVERY y DELIVERED',
                'El texto original de Shalom viaja en rawStatus, por si lo necesitas',
              ].map((t) => (
                <li key={t} className="flex items-start gap-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--tint)] text-[var(--dark)]">
                    <Check size={18} />
                  </span>
                  <span className="pt-1 leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="min-w-0 flex-[1_1_540px]">
            <CodeTabs
              tabs={[
                {
                  id: 'track',
                  label: 'Rastrear guía',
                  request: (
                    <>
                      <span className="text-[var(--signature)]">curl</span> -X POST &quot;{apiUrl}
                      {brand.apiPrefix}/track&quot; \{'\n'}
                      {'  '}-H {str('"x-api-key: $MATHYU_API_KEY"')} \{'\n'}
                      {'  '}-H {str('"content-type: application/json"')} \{'\n'}
                      {'  '}-d {str(`'{"orderNumber":"[N° DE GUÍA]","orderCode":"[CLAVE]"}'`)}
                    </>
                  ),
                  responseLabel: 'Respuesta · forma de ejemplo',
                  response: (
                    <>
                      {'{\n  '}
                      {k('"carrier"')}: {str('"shalom"')},{'\n  '}
                      {k('"trackingNumber"')}: {str('"[N° DE GUÍA]"')},{'\n  '}
                      {k('"status"')}: {num('"IN_TRANSIT"')},{'\n  '}
                      {k('"delivered"')}: {num('false')},{'\n  '}
                      {k('"transitTime"')}: {str('"24 horas"')},{'\n  '}
                      {k('"events"')}: [{'\n    { '}
                      {k('"status"')}: {str('"REGISTERED"')}, {k('"rawStatus"')}: {str('"registrado"')}
                      {' },\n    { '}
                      {k('"status"')}: {str('"IN_TRANSIT"')}, {k('"rawStatus"')}: {str('"transito"')}
                      {' }\n  ]\n}'}
                    </>
                  ),
                },
                {
                  id: 'agencies',
                  label: 'Agencias',
                  request: (
                    <>
                      <span className="text-[var(--signature)]">curl</span> &quot;{apiUrl}
                      {brand.apiPrefix}/agencies?department=AREQUIPA&quot; \{'\n'}
                      {'  '}-H {str('"x-api-key: $MATHYU_API_KEY"')}
                    </>
                  ),
                  responseLabel: 'Respuesta · primer elemento real',
                  response: (
                    <>
                      {'[{\n  '}
                      {k('"code"')}: {str('"3"')},{'\n  '}
                      {k('"name"')}: {str('"CHACHAPOYAS CO DOS DE MAYO"')},{'\n  '}
                      {k('"department"')}: {str('"AMAZONAS"')},{'\n  '}
                      {k('"province"')}: {str('"CHACHAPOYAS"')},{'\n  '}
                      {k('"district"')}: {str('"CHACHAPOYAS"')},{'\n  '}
                      {k('"address"')}: {str('"JR. DOS DE MAYO CDRA. 15 S/N…"')},{'\n  '}
                      {k('"ubigeo"')}: {str('"010101"')},{'\n  '}
                      {k('"latitude"')}: {num('-6.23867')},{'\n  '}
                      {k('"longitude"')}: {num('-77.86801')},{'\n  '}
                      {k('"schedule"')}: {'{ '}
                      {k('"monday"')}: {'{ '}
                      {k('"open"')}: {str('"08:00"')}, {k('"close"')}: {str('"20:00"')}
                      {' }, … },\n  '}
                      {k('"receivesShipments"')}: {num('true')}
                      {'\n}, …]'}
                    </>
                  ),
                },
              ]}
            />
          </Reveal>
        </div>
      </section>

      <Features brand={brand} title="Todo lo que necesitas de Shalom" />
      <Steps brand={brand} />
      <Pricing brand={brand} title="Paga solo por lo que usas" />
      <CtaBand brand={brand} title="¿Listo para integrar Shalom?" text="Crea tu cuenta gratis y obtén una API key al instante. Sin tarjeta." />
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="order-2 text-sm text-[#A9B1D3]">{label}</dt>
      <dd className="text-4xl font-extrabold tracking-tight">
        <CountUp value={value} />
      </dd>
    </div>
  );
}
