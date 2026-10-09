import Link from 'next/link';
import { ArrowRight, Check, CreditCard, KeyRound, UserRound } from 'lucide-react';
import { BRAND_IDS, BRANDS, HUB, type BrandId } from '@/lib/brands';
import { BUNDLES, PLANS } from '@/lib/plans';
import { panelHref, siteHref } from '@/lib/urls';
import { cn, formatSoles } from '@/lib/utils';
import { BundleOffer } from '@/components/marketing/plan-cards';
import { Reveal, Stagger } from './motion';
import { container } from './sections';

const heading = 'text-[clamp(32px,4.2vw,52px)] font-extrabold leading-[1.05] tracking-[-0.03em]';

/** Precio más bajo de pago de una API. */
const fromPrice = (id: BrandId) => Math.min(...PLANS[id].filter((p) => p.pricedPen > 0).map((p) => p.pricedPen));

/** Así se ve el panel: cada API con su plan y su consumo (datos de ejemplo). */
function PanelPreview() {
  const rows: { id: BrandId; plan: string; used: number; limit: number | null }[] = [
    { id: 'shalom', plan: 'Básico', used: 1240, limit: null },
    { id: 'olva', plan: 'Básico', used: 830, limit: null },
    { id: 'sunat', plan: 'Prueba', used: 3, limit: 10 },
  ];
  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-5 text-[var(--foreground)] shadow-[0_30px_80px_-30px_rgba(0,0,0,.6)]">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Tu panel</span>
        <span className="text-xs text-[var(--muted)]">Ejemplo · consumo del mes</span>
      </div>
      <div className="mt-4 space-y-4">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-[var(--border)] p-3.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: BRANDS[r.id].theme.signature }} />
                {BRANDS[r.id].name}
              </span>
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent)]">{r.plan}</span>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[var(--surface)]">
              <div className="h-full rounded-full" style={{ width: `${r.limit ? Math.max(4, (r.used / r.limit) * 100) : 100}%`, background: BRANDS[r.id].theme.signature, opacity: r.limit ? 1 : 0.35 }} />
            </div>
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              {r.used.toLocaleString('es-PE')} {r.limit ? `de ${r.limit.toLocaleString('es-PE')} comprobantes` : 'consultas · ilimitado'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HubLanding() {
  const steps = [
    { icon: UserRound, title: 'Crea una sola cuenta', desc: 'Con Google o con tu correo. Es la misma para Shalom, Olva y SUNAT.' },
    { icon: KeyRound, title: 'Crea tus API keys', desc: 'Una por API, o una para todas. Puedes tener varias (producción, pruebas, otra tienda).' },
    { icon: CreditCard, title: 'Paga solo lo que usas', desc: 'Cada API tiene su plan y su precio. Yape o Plin: subes el comprobante y lo activamos.' },
  ];

  return (
    <>
      <section className="relative overflow-hidden bg-[var(--dark)] text-white">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-48 h-[560px] w-[560px] rounded-full bg-[var(--accent)] opacity-30 blur-3xl" />
        <div className={cn(container, 'relative flex flex-wrap items-center gap-12 py-20')}>
          <Stagger className="flex min-w-0 flex-[1_1_480px] flex-col gap-6">
            <span className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-semibold">
              {BRAND_IDS.map((id) => (
                <span key={id} className="h-2 w-2 rounded-full" style={{ background: BRANDS[id].theme.signature }} />
              ))}
              Shalom · Olva · SUNAT
            </span>
            <h1 className="text-[clamp(40px,5.6vw,72px)] font-extrabold leading-[1.02] tracking-[-0.03em]">{HUB.heroTitle}</h1>
            <p className="max-w-xl text-lg leading-relaxed text-[var(--on-dark-muted)]">{HUB.heroSubtitle}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={panelHref('/register')}
                className="inline-flex items-center gap-2.5 rounded-xl bg-white px-6 py-4 text-[17px] font-semibold text-[var(--dark)] transition hover:-translate-y-px hover:bg-[var(--tint)]"
              >
                Crear cuenta gratis <ArrowRight size={20} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center rounded-xl border border-white/30 px-6 py-4 text-[17px] font-semibold transition-colors hover:bg-white/10"
              >
                Ver precios
              </Link>
            </div>
          </Stagger>
          <div className="flex min-w-0 flex-[1_1_380px] justify-center">
            <PanelPreview />
          </div>
        </div>
      </section>

      <section id="apis" className="bg-white py-24">
        <div className={cn(container, 'flex flex-col gap-10')}>
          <Reveal>
            <div className="flex max-w-2xl flex-col gap-3.5">
              <span className="text-[15px] font-bold text-[var(--accent)]">Las APIs</span>
              <h2 className={heading}>Activa solo las que tu tienda necesita</h2>
              <p className="text-lg leading-relaxed text-[var(--muted)]">
                Cada API tiene su landing, su documentación y su plan. Todas se manejan desde el mismo panel.
              </p>
            </div>
          </Reveal>
          <Reveal>
            <div className="grid gap-5 md:grid-cols-3">
              {BRAND_IDS.map((id) => {
                const brand = BRANDS[id];
                return (
                  <div key={id} className="flex flex-col gap-4 rounded-[18px] border border-[#E6E8EF] bg-white p-7 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,.35)]">
                    <span className="h-1.5 w-12 rounded-full" style={{ background: brand.theme.signature }} />
                    <div>
                      <h3 className="text-[22px] font-bold tracking-tight">{brand.name}</h3>
                      <p className="mt-1 text-[var(--muted)]">{brand.tagline}</p>
                    </div>
                    <ul className="flex flex-1 flex-col gap-2 text-[15px]">
                      {brand.features.slice(0, 3).map((f) => (
                        <li key={f.title} className="flex gap-2">
                          <Check size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                          {f.title}
                        </li>
                      ))}
                    </ul>
                    <p className="text-sm text-[var(--muted)]">
                      Prueba gratis · desde <b className="text-[var(--foreground)]">{formatSoles(fromPrice(id))}</b>/mes
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link href={siteHref(id)} className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--primary-hover)]">
                        Ver {brand.product} <ArrowRight size={15} />
                      </Link>
                      <Link href={siteHref(id, '/docs')} className="inline-flex items-center rounded-[10px] border border-[var(--border)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--surface)]">
                        Documentación
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-[var(--section)] py-16">
        <div className={cn(container, 'flex flex-col gap-4')}>
          {BUNDLES.map((b) => (
            <Reveal key={b.id}>
              <BundleOffer bundle={b} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="bg-white py-24">
        <div className={cn(container, 'flex flex-col gap-12')}>
          <Reveal>
            <div className="flex max-w-2xl flex-col gap-3.5">
              <span className="text-[15px] font-bold text-[var(--accent)]">Cómo funciona</span>
              <h2 className={heading}>Una cuenta, un panel, un pago por API</h2>
            </div>
          </Reveal>
          <Reveal>
            <ol className="grid gap-5 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="flex flex-col gap-3 border-t-[3px] border-[var(--accent)] pt-6">
                  <span className="flex items-center gap-2 font-mono text-[15px] text-[var(--accent)]">
                    <s.icon size={18} /> 0{i + 1}
                  </span>
                  <h3 className="text-[22px] font-bold tracking-tight">{s.title}</h3>
                  <p className="leading-relaxed text-[var(--muted)]">{s.desc}</p>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[15px] leading-relaxed">
              <b>Con el Básico, consultas ilimitadas.</b>{' '}
              <span className="text-[var(--muted)]">
                Pagas una vez por API y usas todas las keys que quieras (una por tienda o por entorno). En el plan de prueba,
                las 20 consultas del mes las comparten todas tus keys de esa API.
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[var(--accent)] py-[88px] text-white">
        <div aria-hidden className="absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full border-[80px] border-white/10" />
        <Reveal className={cn(container, 'relative flex flex-wrap items-center justify-between gap-8')}>
          <div className="flex max-w-2xl flex-col gap-3.5">
            <h2 className="text-[clamp(36px,5.4vw,64px)] font-extrabold leading-[1.02] tracking-[-0.03em]">Empieza gratis hoy</h2>
            <p className="text-lg opacity-90">Todas las APIs tienen un plan de prueba. Subes de plan cuando lo necesites.</p>
          </div>
          <Link
            href={panelHref('/register')}
            className="inline-flex items-center gap-2.5 rounded-xl bg-white px-7 py-[18px] text-lg font-bold text-[var(--dark)] transition-colors hover:bg-[var(--tint)]"
          >
            Crear mi cuenta <ArrowRight size={20} />
          </Link>
        </Reveal>
      </section>
    </>
  );
}
