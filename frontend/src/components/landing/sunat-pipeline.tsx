'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { prefersReducedMotion } from './motion';

const STAGES = [
  { title: 'Envías JSON', desc: 'Mandas los datos del comprobante con tu API key.', code: 'POST /v1/sunat/documents' },
  { title: 'Generamos el XML', desc: 'Armamos el documento en formato UBL 2.1 y lo firmamos.', code: 'UBL 2.1 · firma digital' },
  { title: 'Enviamos a SUNAT', desc: 'Lo mandamos al web service oficial y esperamos respuesta.', code: 'sendBill' },
  { title: 'Recibes el CDR', desc: 'Te devolvemos el estado, el XML firmado y la constancia.', code: 'CDR · aceptado / observado' },
];

/** Flujo de emisión: un marcador recorre las cuatro etapas en bucle. */
export function SunatPipeline() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setTick((t) => (t + 1) % (STAGES.length + 1)), 1600);
    return () => clearInterval(id);
  }, []);

  const stage = Math.min(tick, STAGES.length - 1);

  return (
    <div>
      <div className="relative mx-[12.5%] mb-9 hidden h-0.5 bg-white/25 md:block">
        <span
          className="absolute -top-[9px] h-[18px] w-[18px] rounded-full border-[3px] border-white bg-[#CF000B] transition-[left] duration-1000 ease-[cubic-bezier(.2,.7,0,1)] motion-reduce:transition-none"
          style={{ left: `calc(${(stage / (STAGES.length - 1)) * 100}% - 9px)` }}
        />
      </div>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((s, i) => (
          <li
            key={s.title}
            className={cn(
              'flex flex-col gap-2.5 rounded-2xl border p-[22px] transition-all duration-500 motion-reduce:transition-none',
              i === stage ? '-translate-y-1.5 border-white bg-white text-[#26292E]' : 'border-white/15 bg-white/[.06]',
            )}
          >
            <span
              className={cn(
                'flex h-[34px] w-[34px] items-center justify-center rounded-full font-bold transition-colors duration-500',
                i === stage ? 'bg-[#CF000B] text-white' : i < stage ? 'bg-white text-[var(--dark)]' : 'bg-white/15 text-white',
              )}
            >
              {i + 1}
            </span>
            <span className="text-xl font-bold">{s.title}</span>
            <span className="text-[15px] leading-relaxed opacity-85">{s.desc}</span>
            <span className="font-mono text-xs opacity-75">{s.code}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
