import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import type { Brand } from '@/lib/brands';
import { cn } from '@/lib/utils';
import { DocumentBuilder } from './document-builder';
import { CountUp, Reveal, Stagger } from './motion';
import { RucValidator } from './ruc-validator';
import { ReceiptsScene } from './scenes';
import { container, CtaBand, DISPLAY, Features, Pricing, SectionHeading, Steps } from './sections';
import { SunatPipeline } from './sunat-pipeline';

export function SunatLanding({ brand }: { brand: Brand }) {
  return (
    <>
      <section className="relative overflow-hidden bg-[#F9FAFC]">
        <div aria-hidden className="absolute -right-[8%] -top-[10%] hidden h-[120%] w-[58%] rounded-bl-[48%] bg-[var(--primary)] md:block" />
        <div className={cn(container, 'relative flex flex-wrap items-center gap-8 pb-20 pt-[72px]')}>
          <Stagger className="flex min-w-0 flex-[1_1_480px] flex-col gap-6">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[var(--tint)] px-3.5 py-1.5 text-sm font-medium text-[var(--primary)]">Facturación electrónica · UBL 2.1</span>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#FDECEC] px-3.5 py-1.5 text-sm font-medium text-[#A80009]">
                <span className="h-2 w-2 rounded-full bg-[#CF000B]" /> En desarrollo · acceso anticipado
              </span>
            </div>
            <h1 className={cn('text-[clamp(42px,5.8vw,74px)] leading-[1.02]', DISPLAY.sunat)}>
              Emite comprobantes y consulta <span className="text-[var(--primary)]">SUNAT</span> por API
            </h1>
            <p className="max-w-xl text-[19px] leading-relaxed text-[var(--muted)]">{brand.heroSubtitle}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2.5 rounded-xl bg-[var(--primary)] px-6 py-4 text-[17px] font-medium text-white transition hover:-translate-y-px hover:bg-[var(--primary-hover)]"
              >
                Crear mi API key <ArrowRight size={20} />
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center rounded-xl border-[1.5px] border-[var(--primary)] bg-white px-[22px] py-[15px] text-[17px] font-medium text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-white"
              >
                Ver documentación
              </Link>
            </div>
            <dl className="mt-2 grid max-w-xl grid-cols-3 gap-4 border-t border-[#DEE3EA] pt-6">
              <Stat value={50} label="comprobantes gratis al mes" />
              <Stat value={18} suffix="%" label="IGV calculado por ti" />
              <Stat value={4} label="tipos de comprobante" />
            </dl>
          </Stagger>

          <div className="relative h-[500px] min-w-0 flex-[1_1_480px] md:h-[620px]">
            <ReceiptsScene />
            <div className="absolute bottom-9 left-[4%] flex items-center gap-3 rounded-[14px] bg-white px-[18px] py-3.5 shadow-[0_24px_48px_-20px_rgba(38,41,46,.45)]">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F5EC] text-[#1B7A3A]">
                <Check size={22} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-bold">CDR recibido</span>
                <span className="font-mono text-xs text-[#5D6470]">Ejemplo · F001-[N°] aceptada</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section id="flujo" className="bg-[var(--primary)] py-[88px] text-white">
        <div className={cn(container, 'flex flex-col gap-11')}>
          <Reveal>
            <SectionHeading brand={brand} dark eyebrow="Cómo funciona" title="Tú mandas JSON. Nosotros hablamos con SUNAT." className="[&>span]:text-white/85" />
          </Reveal>
          <Reveal>
            <SunatPipeline />
          </Reveal>
        </div>
      </section>

      <section id="comprobantes" className="bg-white py-24">
        <div className={cn(container, 'flex flex-col gap-10')}>
          <Reveal className="flex flex-wrap items-end justify-between gap-5">
            <SectionHeading
              brand={brand}
              eyebrow="Comprobantes electrónicos"
              title="Arma un comprobante y mira el resultado"
              intro="Elige el tipo y el monto. Calculamos el IGV y te mostramos cómo se vería la petición."
              className="[&>span]:text-[#CF000B]"
            />
            <span className="rounded-lg bg-[#FDECEC] px-3 py-2 text-sm font-medium text-[#A80009]">Vista previa · el formato final puede cambiar</span>
          </Reveal>
          <Reveal>
            <DocumentBuilder />
          </Reveal>
        </div>
      </section>

      <section id="ruc" className="bg-[var(--section)] py-24">
        <div className={cn(container, 'flex flex-wrap items-center gap-12')}>
          <Reveal className="min-w-0 flex-[1_1_400px]">
            <SectionHeading
              brand={brand}
              eyebrow="Consulta RUC y DNI"
              title="Valida el RUC antes de facturar"
              intro="Escribe un RUC: comprobamos el dígito verificador al instante, igual que hace la API antes de consultar el padrón."
              className="[&>span]:text-[#CF000B]"
            />
          </Reveal>
          <Reveal className="min-w-0 flex-[1_1_500px]">
            <RucValidator apiPrefix={brand.apiPrefix} />
          </Reveal>
        </div>
      </section>

      <Features brand={brand} title="Facturación sin XML a mano" />
      <Steps brand={brand} />
      <Pricing brand={brand} title="Paga por comprobante emitido" />
      <CtaBand brand={brand} title="¿Listo para facturar desde tu código?" text="Crea tu cuenta gratis y obtén una API key para el entorno de pruebas." />
    </>
  );
}

function Stat({ value, suffix, label }: { value: number; suffix?: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="order-2 text-sm text-[#5D6470]">{label}</dt>
      <dd className="text-4xl font-black text-[var(--primary)]">
        <CountUp value={value} suffix={suffix} />
      </dd>
    </div>
  );
}
