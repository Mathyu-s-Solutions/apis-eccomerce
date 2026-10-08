'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Ubigeos INEI de capitales de departamento (departamento + provincia + distrito).
const CITIES: [string, string][] = [
  ['150101', 'Lima'],
  ['040101', 'Arequipa'],
  ['130101', 'Trujillo'],
  ['080101', 'Cusco'],
  ['200101', 'Piura'],
  ['140101', 'Chiclayo'],
  ['120101', 'Huancayo'],
  ['160101', 'Iquitos'],
];
const ORIGINS = ['150101', '040101', '130101'];
const city = (code: string) => CITIES.find(([c]) => c === code)?.[1] ?? code;

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-full border-[1.5px] px-3.5 py-2.5 font-medium transition-colors',
        on ? 'border-[#020617] bg-[#020617] text-[var(--signature)]' : 'border-[#CBD5E1] bg-white text-[#020617] hover:border-[#020617]',
      )}
    >
      {children}
    </button>
  );
}

/** Arma la petición de cotización por ubigeo y la muestra lista para copiar. */
export function QuoteBuilder({ apiUrl }: { apiUrl: string }) {
  const [origin, setOrigin] = useState('150101');
  const [dest, setDest] = useState('040101');
  const [weight, setWeight] = useState(0.5);

  const pickOrigin = (code: string) => {
    setOrigin(code);
    if (dest === code) setDest(code === '150101' ? '040101' : '150101');
  };
  const body = JSON.stringify({ origin, destination: dest, shipmentType: 1, weight });

  return (
    <div className="flex flex-wrap items-stretch gap-5">
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-6 rounded-[20px] border-[1.5px] border-[#020617] bg-white p-7">
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-sm font-bold">Origen</legend>
          <div className="flex flex-wrap gap-2">
            {ORIGINS.map((code) => (
              <Chip key={code} on={code === origin} onClick={() => pickOrigin(code)}>
                {city(code)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-sm font-bold">Destino</legend>
          <div className="flex flex-wrap gap-2">
            {CITIES.filter(([code]) => code !== origin).map(([code, name]) => (
              <Chip key={code} on={code === dest} onClick={() => setDest(code)}>
                {name}
              </Chip>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2.5">
          <label htmlFor="quote-weight" className="flex justify-between text-sm font-bold">
            <span>Peso</span>
            <span className="font-mono">{weight.toFixed(1)} kg</span>
          </label>
          <input
            id="quote-weight"
            type="range"
            min={0.5}
            max={30}
            step={0.5}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="w-full accent-[#020617]"
          />
        </div>
        <div className="flex items-center gap-3.5 rounded-[14px] bg-[#F8FAFC] p-4 text-lg font-extrabold">
          <span>{city(origin)}</span>
          <ArrowRight className="flex-1" />
          <span>{city(dest)}</span>
        </div>
      </div>

      <div className="flex min-w-0 flex-[1_1_480px] flex-col overflow-hidden rounded-[20px] bg-[#020617] text-[#E2E8F0]">
        <div className="flex items-center justify-between border-b border-[#1E293B] px-5 py-3.5 text-[13px] text-[#94A3B8]">
          <span>Petición</span>
          <span className="rounded-md bg-[var(--signature)] px-2 py-0.5 font-bold text-[#020617]">1 consulta</span>
        </div>
        <pre className="code-scroll flex-1 overflow-x-auto whitespace-pre px-6 py-5 font-mono text-sm leading-7">
          <span className="text-[var(--signature)]">curl</span> -X POST &quot;{apiUrl}/v1/olva/quote&quot; \{'\n'}
          {'  '}-H <span className="text-[#FDE68A]">&quot;x-api-key: $MATHYU_API_KEY&quot;</span> \{'\n'}
          {'  '}-H <span className="text-[#FDE68A]">&quot;content-type: application/json&quot;</span> \{'\n'}
          {'  '}-d <span className="text-[#FDE68A]">&apos;{body}&apos;</span>
        </pre>
        <p className="border-t border-[#1E293B] px-6 py-4 text-sm text-[#94A3B8]">
          La respuesta trae el costo calculado por Olva para ese tramo y peso.
        </p>
      </div>
    </div>
  );
}
