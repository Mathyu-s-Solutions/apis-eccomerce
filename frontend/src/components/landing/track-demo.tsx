'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { prefersReducedMotion } from './motion';

// Los estados normalizados que devuelve POST /track (ShipmentStatus en el backend).
const STEPS: [string, string][] = [
  ['Registrado', 'REGISTERED'],
  ['En tránsito', 'IN_TRANSIT'],
  ['En agencia destino', 'AT_DESTINATION'],
  ['En reparto', 'OUT_FOR_DELIVERY'],
  ['Entregado', 'DELIVERED'],
];

/** Tarjeta de rastreo que avanza sola por los estados (ilustrativa, sin datos reales). */
export function TrackDemo({ endpoint }: { endpoint: string }) {
  const [tick, setTick] = useState(1);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    // 7 pasos por vuelta: se queda en "Entregado" un par de ciclos antes de reiniciar.
    const id = setInterval(() => setTick((t) => (t + 1) % 7), 1500);
    return () => clearInterval(id);
  }, []);

  const step = Math.min(tick, STEPS.length - 1);

  return (
    <div className="float-y w-[300px] rounded-2xl bg-white p-5 text-[var(--dark)] shadow-[0_30px_60px_-20px_rgba(0,0,0,.5)]">
      <div className="flex items-center justify-between text-xs text-[#6B7290]">
        <span className="font-mono">POST {endpoint}</span>
        <span className="rounded-md bg-[var(--tint)] px-2 py-0.5 font-semibold text-[var(--dark)]">Ejemplo</span>
      </div>
      <p className="mb-1.5 mt-2.5 text-lg font-bold">Guía de ejemplo</p>
      <p className="mb-2 font-mono text-[13px] text-[var(--accent)]">status: {STEPS[step][1]}</p>
      <ol>
        {STEPS.map(([label], i) => (
          <li
            key={label}
            className={cn(
              'flex items-center gap-3 py-2 text-[15px] transition-colors duration-500',
              i <= step ? 'text-[var(--dark)]' : 'text-[#8C93AE]',
              i === step && 'font-semibold',
            )}
          >
            <span
              className={cn(
                'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 text-white transition-all duration-500',
                i < step && 'border-[var(--dark)] bg-[var(--dark)]',
                i === step && 'border-[var(--signature)] bg-[var(--signature)] shadow-[0_0_0_6px_rgba(238,42,47,.18)]',
                i > step && 'border-[#D3D7E5] bg-white',
              )}
            >
              <Check size={12} strokeWidth={3} />
            </span>
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}
