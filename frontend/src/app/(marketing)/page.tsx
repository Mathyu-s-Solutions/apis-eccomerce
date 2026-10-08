import Link from 'next/link';
import { ArrowRight, Check, KeyRound, Terminal, Zap } from 'lucide-react';
import { getBrand } from '@/lib/brand-server';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { CodeBlock } from '@/components/ui/code-block';
import { FeatureIcon } from '@/components/marketing/icon';

export default async function LandingPage() {
  const brand = await getBrand();

  return (
    <>
      {/* Hero */}
      <section className="hero-grid">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 md:pb-24 md:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full brand-gradient" />
              API de {brand.product} para desarrolladores
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight md:text-6xl">
              {brand.heroTitle}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-[var(--muted)]">{brand.heroSubtitle}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/register" size="lg">
                Crear mi API key <ArrowRight size={18} />
              </ButtonLink>
              <ButtonLink href="/docs" variant="outline" size="lg">
                Ver documentación
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-[var(--muted)]">Empieza gratis. Paga con Yape o Plin cuando necesites más.</p>
          </div>

          {/* Quickstart */}
          <div className="mx-auto mt-14 max-w-3xl">
            <CodeBlock label="Prueba en segundos" code={brand.quickstart[0].code} />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight">Todo lo que necesitas de {brand.product}</h2>
          <p className="mt-3 text-[var(--muted)]">Una sola integración, mantenida por nosotros, con tu propia cuota y panel.</p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {brand.features.map((f) => (
            <Card key={f.title} className="p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <FeatureIcon name={f.icon} />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-[var(--muted)]">{f.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Steps */}
      <section className="border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <h2 className="text-center text-3xl font-bold tracking-tight">Empieza en 3 pasos</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              { icon: KeyRound, title: 'Crea tu cuenta y tu API key', desc: 'Regístrate y genera una key desde el panel en un clic.' },
              { icon: Terminal, title: 'Llama a la API', desc: `Envía tu key en el header x-api-key a ${brand.apiPrefix}. Copia un ejemplo de la documentación.` },
              { icon: Zap, title: 'Escala cuando quieras', desc: 'Sube de plan pagando con Yape o Plin; nosotros validamos y ampliamos tu cuota.' },
            ].map((s, i) => (
              <div key={s.title} className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white brand-gradient">
                  <s.icon size={22} />
                </div>
                <div className="mt-4 text-sm font-semibold text-[var(--accent)]">Paso {i + 1}</div>
                <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-[var(--muted)]">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Card className="overflow-hidden">
          <div className="grid items-center gap-8 p-8 md:grid-cols-2 md:p-12">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">¿Listo para integrar {brand.product}?</h2>
              <p className="mt-3 text-[var(--muted)]">
                Crea tu cuenta gratis y obtén una API key al instante. Sin tarjeta: cuando necesites más, pagas con Yape o Plin.
              </p>
              <div className="mt-6 flex gap-3">
                <ButtonLink href="/register" size="lg">Crear cuenta gratis</ButtonLink>
                <ButtonLink href="/pricing" variant="outline" size="lg">Ver precios</ButtonLink>
              </div>
            </div>
            <ul className="space-y-3">
              {['Plan gratuito para probar', 'Cuota y consumo en tiempo real', 'Pago con Yape o Plin', 'Soporte en español'].map((t) => (
                <li key={t} className="flex items-center gap-3 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Check size={14} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          ¿Buscas otra API? <Link href="/docs" className="font-medium text-[var(--accent)]">Mira la documentación</Link>.
        </p>
      </section>
    </>
  );
}
