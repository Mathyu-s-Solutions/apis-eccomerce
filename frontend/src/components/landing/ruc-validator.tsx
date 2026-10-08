'use client';

import { useState } from 'react';

const FACTORS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Dígito verificador de un RUC (módulo 11), a partir de sus 10 primeros dígitos. */
export function rucCheckDigit(ruc: string): number {
  const sum = FACTORS.reduce((acc, f, i) => acc + Number(ruc[i]) * f, 0);
  const d = 11 - (sum % 11);
  return d === 10 ? 0 : d === 11 ? 1 : d;
}

type Verdict = 'partial' | 'prefix' | 'ok' | 'bad';

const STYLES: Record<Verdict, string> = {
  partial: 'bg-[#F2F5F8] text-[#26292E]',
  prefix: 'bg-[#FDECEC] text-[#A80009]',
  ok: 'bg-[#E8F5EC] text-[#1B7A3A]',
  bad: 'bg-[#FDECEC] text-[#A80009]',
};

/** Valida el formato de un RUC mientras se escribe, como hace la API antes de ir al padrón. */
export function RucValidator({ apiPrefix }: { apiPrefix: string }) {
  const [ruc, setRuc] = useState('20100066603');

  const expected = ruc.length === 11 ? rucCheckDigit(ruc) : null;
  const verdict: Verdict =
    ruc.length < 11 ? 'partial' : !/^(10|15|16|17|20)/.test(ruc) ? 'prefix' : expected === Number(ruc[10]) ? 'ok' : 'bad';
  const message: Record<Verdict, [string, string]> = {
    partial: ['Escribe los 11 dígitos', `Faltan ${11 - ruc.length} dígitos.`],
    prefix: ['El prefijo no es válido', 'Un RUC empieza con 10, 15, 16, 17 o 20.'],
    ok: ['Dígito verificador correcto', 'El RUC tiene un formato válido. La API consulta el padrón para traer razón social, estado y condición.'],
    bad: ['Dígito verificador incorrecto', `Para estos 10 primeros dígitos el verificador debería ser ${expected}.`],
  };

  return (
    <div className="flex flex-col gap-[18px] rounded-[20px] bg-white p-7 shadow-[0_30px_60px_-36px_rgba(0,86,172,.45)]">
      <label htmlFor="ruc" className="text-sm font-bold">
        Número de RUC
      </label>
      <input
        id="ruc"
        inputMode="numeric"
        autoComplete="off"
        maxLength={11}
        placeholder="11 dígitos"
        value={ruc}
        onChange={(e) => setRuc(e.target.value.replace(/\D/g, '').slice(0, 11))}
        className="rounded-xl border-[1.5px] border-[#C9D2DF] px-[18px] py-4 font-mono text-[26px] tracking-[0.08em] outline-none focus:border-[var(--primary)]"
      />
      <div className="grid grid-cols-11 gap-1" aria-hidden>
        {Array.from({ length: 11 }, (_, i) => {
          const ch = ruc[i];
          const check = i === 10;
          const color = !ch
            ? '#C9D2DF'
            : check
              ? verdict === 'ok'
                ? '#1B7A3A'
                : verdict === 'bad'
                  ? '#CF000B'
                  : '#26292E'
              : i < 2
                ? '#0056AC'
                : '#26292E';
          return (
            <span
              key={i}
              className="flex h-10 items-center justify-center rounded-lg border-[1.5px] font-mono text-[17px] font-medium transition-colors"
              style={{ borderColor: color, color, background: check ? '#F2F5F8' : '#FFFFFF' }}
            >
              {ch ?? '·'}
            </span>
          );
        })}
      </div>
      <div aria-live="polite" className={`flex flex-col gap-1 rounded-xl px-4 py-3.5 ${STYLES[verdict]}`}>
        <span className="font-bold">{message[verdict][0]}</span>
        <span className="text-sm leading-relaxed">{message[verdict][1]}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-xl bg-[#1D2733] px-[18px] py-3.5 font-mono text-sm text-[#DEE3EA]">
        <span className="rounded-md bg-[var(--primary)] px-2 py-0.5 text-white">GET</span>
        <span className="break-all">
          {apiPrefix}/ruc/{ruc || '{ruc}'}
        </span>
        <span className="ml-auto text-[#9AA6B5]">gratis</span>
      </div>
    </div>
  );
}
