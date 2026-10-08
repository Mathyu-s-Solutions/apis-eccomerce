import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { Brand, BrandId } from '@/lib/brands';
import { PLANS } from '@/lib/plans';
import { cn, formatNumber } from '@/lib/utils';
import { FeatureIcon } from '@/components/marketing/icon';
import { Reveal } from './motion';

/** Peso y tracking de los titulares según la tipografía de cada marca. */
export const DISPLAY: Record<BrandId, string> = {
  shalom: 'font-extrabold tracking-[-0.02em] leading-[1.05]',
  olva: 'font-black tracking-[-0.04em] leading-[1.02]',
  sunat: 'font-black tracking-[-0.03em] leading-[1.04]',
};

export const container = 'mx-auto max-w-6xl px-4';

export function SectionHeading({
  brand,
  eyebrow,
  title,
  intro,
  dark,
  className,
}: {
  brand: Brand;
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex max-w-2xl flex-col gap-3.5', className)}>
      {eyebrow && (
        <span className={cn('text-[15px] font-bold', dark ? 'text-[var(--signature)]' : 'text-[var(--accent)]')}>{eyebrow}</span>
      )}
      <h2 className={cn('text-[clamp(32px,4.2vw,54px)]', DISPLAY[brand.id])}>{title}</h2>
      {intro && (
        <p className={cn('text-lg leading-relaxed', dark ? 'text-[var(--on-dark-muted)]' : 'text-[var(--muted)]')}>{intro}</p>
      )}
    </div>
  );
}

const TILES = [
  'bg-[var(--signature)] text-[var(--on-signature)]',
  'bg-[var(--dark)] text-white',
  'bg-[var(--tint)] text-[var(--dark)]',
];

export function Features({ brand, title }: { brand: Brand; title: string }) {
  const ruled = brand.id === 'olva';
  return (
    <section id="funciones" className="bg-white py-24">
      <div className={cn(container, 'flex flex-col gap-10')}>
        <Reveal>
          <SectionHeading brand={brand} eyebrow="Funciones" title={title} intro="Una sola integración, mantenida por nosotros, con tu propia cuota y panel." />
        </Reveal>
        <Reveal>
          <div
            className={cn(
              'grid sm:grid-cols-2 lg:grid-cols-3',
              ruled ? 'border-l-2 border-t-2 border-[var(--foreground)]' : 'gap-[18px]',
            )}
          >
            {brand.features.map((f, i) => (
              <div
                key={f.title}
                className={cn(
                  'flex flex-col gap-3.5 bg-white p-7 transition duration-300 hover:-translate-y-1',
                  ruled
                    ? 'border-b-2 border-r-2 border-[var(--foreground)] p-8 hover:bg-[var(--tint)]'
                    : 'rounded-[18px] border border-[#E6E8EF] hover:border-[var(--signature)] hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,.35)]',
                )}
              >
                {ruled ? (
                  <FeatureIcon name={f.icon} size={32} />
                ) : (
                  <span className={cn('flex h-12 w-12 items-center justify-center rounded-xl', TILES[i % TILES.length])}>
                    <FeatureIcon name={f.icon} size={24} />
                  </span>
                )}
                <h3 className="text-[21px] font-bold tracking-tight">{f.title}</h3>
                <p className="leading-relaxed text-[var(--muted)]">{f.description}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Steps({ brand }: { brand: Brand }) {
  const steps = [
    { title: 'Crea tu cuenta y tu API key', desc: 'Regístrate y genera una key desde el panel en un clic.' },
    { title: 'Llama a la API', desc: `Envía tu key en el header x-api-key a ${brand.apiPrefix}. Copia un ejemplo de la documentación.` },
    { title: 'Escala cuando quieras', desc: 'Sube de plan pagando con Yape o Plin; nosotros validamos y ampliamos tu cuota.' },
  ];
  const dark = brand.id === 'shalom';

  return (
    <section className={cn('py-24', dark ? 'bg-[var(--dark)] text-white' : 'border-t border-[#E2E8F0] bg-[var(--section)]')}>
      <div className={cn(container, 'flex flex-col gap-12')}>
        <Reveal>
          <SectionHeading brand={brand} title="Empieza en 3 pasos" dark={dark} />
        </Reveal>
        <Reveal>
          <ol className="grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className={cn(
                  'flex flex-col gap-3',
                  brand.id === 'shalom' && 'border-t-[3px] pt-6',
                  brand.id === 'shalom' && ['border-[var(--signature)]', 'border-[var(--tint)]', 'border-white'][i],
                  brand.id === 'olva' && 'rounded-[18px] border border-[#E2E8F0] bg-white p-7',
                  brand.id === 'sunat' && cn('border-l-4 py-1 pl-[22px]', i === 2 ? 'border-[#CF000B]' : 'border-[var(--primary)]'),
                )}
              >
                {brand.id === 'olva' ? (
                  <span
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-full text-xl font-black',
                      ['bg-[var(--signature)] text-[#020617]', 'bg-[#020617] text-[var(--signature)]', 'bg-[var(--accent)] text-white'][i],
                    )}
                  >
                    {i + 1}
                  </span>
                ) : (
                  <span className={cn('font-mono text-[15px]', dark ? 'text-[var(--tint)]' : i === 2 ? 'text-[#CF000B]' : 'text-[var(--primary)]')}>
                    {dark ? `0${i + 1}` : `Paso ${i + 1}`}
                  </span>
                )}
                <h3 className="text-[22px] font-bold tracking-tight">{s.title}</h3>
                <p className={cn('leading-relaxed', dark ? 'text-[var(--on-dark-muted)]' : 'text-[var(--muted)]')}>{s.desc}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

const HIGHLIGHT: Record<BrandId, { card: string; badge: string; button: string }> = {
  shalom: {
    card: 'bg-[var(--dark)] text-white',
    badge: 'bg-[var(--signature)] text-white',
    button: 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]',
  },
  olva: {
    card: 'border-2 border-[#020617] bg-[var(--signature)] text-[#020617]',
    badge: 'bg-[#020617] text-[var(--signature)]',
    button: 'bg-[#020617] text-white hover:bg-[#1E293B]',
  },
  sunat: {
    card: 'bg-[var(--primary)] text-white',
    badge: 'bg-[#CF000B] text-white',
    button: 'bg-white text-[var(--primary)] hover:bg-[#EDF0F4]',
  },
};

export function Pricing({ brand, title }: { brand: Brand; title: string }) {
  const hl = HIGHLIGHT[brand.id];
  const unit = brand.id === 'sunat' ? 'comprobantes' : 'consultas';

  return (
    <section id="precios" className="bg-[var(--section)] py-24">
      <div className={cn(container, 'flex flex-col gap-10')}>
        <Reveal>
          <SectionHeading brand={brand} eyebrow="Precios en soles" title={title} />
        </Reveal>
        <Reveal>
          <div className="grid gap-[18px] pt-3 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS[brand.id].map((plan) => {
              const href = plan.pricedPen === 0 ? '/register' : `/dashboard/billing?plan=${plan.id}`;
              return (
                <div
                  key={plan.id}
                  className={cn(
                    'relative flex flex-col gap-[18px] rounded-[18px] p-7 transition-transform duration-300 hover:-translate-y-1.5',
                    plan.highlight ? hl.card : 'border border-[#E6E8EF] bg-white',
                  )}
                >
                  {plan.highlight && (
                    <span className={cn('absolute -top-3.5 left-7 rounded-full px-3 py-1 text-[13px] font-bold', hl.badge)}>Más elegido</span>
                  )}
                  <span className="text-lg font-bold">{plan.name}</span>
                  <div>
                    <span className={cn('text-[44px]', DISPLAY[brand.id])}>S/ {plan.pricedPen}</span>
                    <span className="opacity-70"> /mes</span>
                  </div>
                  <p className="-mt-3 text-sm opacity-80">
                    {plan.monthlyLimit === null ? `${unit[0].toUpperCase()}${unit.slice(1)} ilimitados` : `${formatNumber(plan.monthlyLimit)} ${unit}/mes`}
                  </p>
                  <ul className="flex flex-1 flex-col gap-2.5 text-[15px]">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2.5">
                        <Check size={18} className={cn('mt-0.5 shrink-0', !plan.highlight && 'text-[var(--accent)]')} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={href}
                    className={cn(
                      'rounded-[10px] p-3.5 text-center font-semibold transition-colors',
                      plan.highlight
                        ? hl.button
                        : 'border-[1.5px] border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-[var(--on-primary)]',
                    )}
                  >
                    {plan.pricedPen === 0 ? 'Empezar gratis' : `Elegir ${plan.name}`}
                  </Link>
                </div>
              );
            })}
          </div>
        </Reveal>
        <p className="text-[15px] text-[var(--muted)]">Pagas con Yape o Plin, subes tu comprobante y ampliamos tu cuota al validarlo.</p>
      </div>
    </section>
  );
}

export function CtaBand({ brand, title, text }: { brand: Brand; title: string; text: string }) {
  const olva = brand.id === 'olva';
  return (
    <section className={cn('relative overflow-hidden bg-[var(--signature)] py-[88px] text-[var(--on-signature)]', olva && 'border-t-2 border-[#020617]')}>
      {brand.id === 'shalom' && (
        <div aria-hidden className="absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full border-[80px] border-white/10" />
      )}
      {brand.id === 'sunat' && <div aria-hidden className="absolute -bottom-64 -right-24 h-[460px] w-[460px] rounded-full bg-[#CF000B]" />}
      <Reveal className={cn(container, 'relative flex flex-wrap items-center justify-between gap-8')}>
        <div className="flex max-w-2xl flex-col gap-3.5">
          <h2 className={cn('text-[clamp(36px,5.4vw,72px)]', DISPLAY[brand.id])}>{title}</h2>
          <p className="text-lg opacity-90">{text}</p>
        </div>
        <Link
          href="/register"
          className={cn(
            'inline-flex items-center gap-2.5 rounded-xl px-7 py-[18px] text-lg font-bold transition-colors',
            olva ? 'bg-[#020617] text-white hover:bg-[#1E293B]' : 'bg-white text-[var(--dark)] hover:bg-[#EDF0F4]',
          )}
        >
          Crear cuenta gratis <ArrowRight size={20} />
        </Link>
      </Reveal>
    </section>
  );
}
