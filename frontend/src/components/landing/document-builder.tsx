'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

// Catálogo 01 (tipo de comprobante) y 06 (tipo de documento de identidad) de SUNAT.
const TYPES = [
  { code: '01', label: 'Factura', serie: 'F001', title: 'FACTURA ELECTRÓNICA', client: { tipoDoc: '6', name: 'RUC', placeholder: '[RUC DEL CLIENTE]' } },
  { code: '03', label: 'Boleta', serie: 'B001', title: 'BOLETA DE VENTA ELECTRÓNICA', client: { tipoDoc: '1', name: 'DNI', placeholder: '[DNI DEL CLIENTE]' } },
  { code: '07', label: 'Nota de crédito', serie: 'FC01', title: 'NOTA DE CRÉDITO ELECTRÓNICA', client: { tipoDoc: '6', name: 'RUC', placeholder: '[RUC DEL CLIENTE]' } },
  { code: '08', label: 'Nota de débito', serie: 'FD01', title: 'NOTA DE DÉBITO ELECTRÓNICA', client: { tipoDoc: '6', name: 'RUC', placeholder: '[RUC DEL CLIENTE]' } },
];
const IGV = 0.18;

const money = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Vista previa del comprobante y de la petición. El endpoint de emisión aún está en desarrollo:
 * el cuerpo es ilustrativo y puede cambiar.
 */
export function DocumentBuilder() {
  const [code, setCode] = useState('01');
  const [amount, setAmount] = useState('100.00');
  const t = TYPES.find((x) => x.code === code) ?? TYPES[0];

  const sub = Math.max(0, Number(amount) || 0);
  const igv = round2(sub * IGV);
  const total = round2(sub + igv);
  const doc = {
    tipo: t.code,
    serie: t.serie,
    moneda: 'PEN',
    cliente: { tipoDoc: t.client.tipoDoc, numDoc: t.client.placeholder },
    items: [{ descripcion: '[PRODUCTO]', cantidad: 1, valorUnitario: round2(sub) }],
    igv,
    total,
    ...(t.code === '07' || t.code === '08' ? { documentoAfectado: 'F001-[N°]' } : {}),
  };

  return (
    <div className="flex flex-wrap items-stretch gap-6">
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-6">
        <fieldset>
          <legend className="mb-2.5 text-sm font-bold">Tipo de comprobante</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {TYPES.map((x) => (
              <button
                key={x.code}
                type="button"
                aria-pressed={x.code === code}
                onClick={() => setCode(x.code)}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-[10px] border-[1.5px] bg-white px-4 py-2.5 text-left transition-colors',
                  x.code === code ? 'border-[var(--primary)] bg-[#E6F2F8] shadow-[inset_0_0_0_1px_var(--primary)]' : 'border-[#C9D2DF] hover:border-[var(--primary)]',
                )}
              >
                <span className="font-bold">{x.label}</span>
                <span className="font-mono text-xs text-[#5D6470]">
                  Código {x.code} · serie {x.serie}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2.5">
          <label htmlFor="doc-amount" className="text-sm font-bold">
            Valor de venta (sin IGV)
          </label>
          <div className="flex items-stretch overflow-hidden rounded-[10px] border-[1.5px] border-[#C9D2DF] bg-white">
            <span className="flex items-center border-r border-[#DEE3EA] px-3.5 font-medium text-[#5D6470]">S/</span>
            <input
              id="doc-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-w-0 flex-1 p-3.5 text-[17px] outline-none"
            />
          </div>
        </div>
        <dl className="flex flex-col gap-2 rounded-[14px] bg-[#F2F5F8] p-[18px] text-[15px]">
          <Row label="Valor de venta" value={money(sub)} />
          <Row label="IGV 18%" value={money(igv)} />
          <div className="flex justify-between border-t border-[#DEE3EA] pt-2 text-[17px] font-bold">
            <dt>Importe total</dt>
            <dd className="font-mono text-[var(--primary)]">{money(total)}</dd>
          </div>
        </dl>
      </div>

      <div className="flex min-w-0 flex-[1_1_300px] items-start justify-center pt-2">
        <div className="relative flex w-full max-w-[330px] flex-col gap-3.5 border-t-[6px] border-[var(--primary)] bg-white px-6 pb-8 pt-6 text-[13px] shadow-[0_30px_60px_-30px_rgba(38,41,46,.45)]">
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-[15px] font-bold text-[var(--primary)]">{t.title}</span>
            <span className="font-mono text-[15px]">{t.serie}-[N°]</span>
            <span className="text-[#5D6470]">RUC [RUC DEL EMISOR]</span>
          </div>
          <div className="flex flex-col gap-1 border-t border-dashed border-[#C9D2DF] pt-3">
            <span className="text-[#5D6470]">Cliente · {t.client.name}</span>
            <span className="font-mono">{t.client.placeholder}</span>
          </div>
          <div className="flex justify-between border-t border-dashed border-[#C9D2DF] pt-3">
            <span>1 × [PRODUCTO]</span>
            <span className="font-mono">{money(sub)}</span>
          </div>
          <dl className="flex flex-col gap-1 border-t border-dashed border-[#C9D2DF] pt-3">
            <Row label="Op. gravada" value={money(sub)} muted />
            <Row label="IGV" value={money(igv)} muted />
            <div className="flex justify-between text-[15px] font-bold">
              <dt>Total</dt>
              <dd className="font-mono">{money(total)}</dd>
            </div>
          </dl>
          <p className="border-t border-dashed border-[#C9D2DF] pt-3 text-xs leading-snug text-[#5D6470]">
            Representación impresa del comprobante electrónico
          </p>
          <span className="absolute right-[18px] top-[92px] -rotate-[8deg] rounded-md border-2 border-[#1B7A3A] px-2 py-1 text-xs font-bold text-[#1B7A3A]">
            ACEPTADO
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-[1_1_400px] flex-col overflow-hidden rounded-[18px] bg-[#1D2733] text-[#DEE3EA]">
        <div className="flex items-center justify-between border-b border-[#2E3A48] px-5 py-3.5 text-[13px]">
          <span className="font-mono">
            <span className="text-[#FF8A8F]">POST</span> /v1/sunat/documents
          </span>
          <span className="text-[#9AA6B5]">1 comprobante</span>
        </div>
        <pre className="code-scroll flex-1 overflow-x-auto whitespace-pre px-[22px] py-5 font-mono text-[13.5px] leading-7">
          {JSON.stringify(doc, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={muted ? 'text-[#5D6470]' : 'text-[#4A515C]'}>{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
