'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Download, Loader2, Smartphone, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, Input, Label, Select, Alert } from '@/components/ui/primitives';
import { formatSoles } from '@/lib/utils';

const YAPE_QR = '/pay/yape-qr.png';

/** Algo que se puede pagar: `plan:<api>:<plan>` o `bundle:<pack>`. */
export interface PaymentChoice {
  value: string;
  group: string;
  label: string;
  amountPen: number;
}

interface Props {
  choices: PaymentChoice[];
  initial: string;
  yape: string;
  plin: string;
  payName: string;
}

export function PaymentForm({ choices, initial, yape, plin, payName }: Props) {
  const router = useRouter();
  const [choiceValue, setChoiceValue] = useState(initial);
  const [method, setMethod] = useState<'yape' | 'plin'>('yape');
  const [operationCode, setOperationCode] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const choice = choices.find((c) => c.value === choiceValue);
  const groups = [...new Set(choices.map((c) => c.group))];
  const number = method === 'yape' ? yape : plin;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) { setError('Sube la foto del comprobante'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      const [kind, a, b] = choiceValue.split(':');
      if (kind === 'bundle') fd.set('bundle', a);
      else {
        fd.set('product', a);
        fd.set('plan', b);
      }
      fd.set('method', method);
      fd.set('operationCode', operationCode);
      fd.set('proof', file);
      const res = await fetch('/api/payments', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message ?? 'No se pudo registrar el pago'); return; }
      setDone(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Alert tone="success">
        ¡Recibimos tu comprobante! Lo validaremos pronto y activaremos tu plan. Puedes ver el estado abajo.
      </Alert>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Pagar con Yape o Plin</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Elige el plan de una API o un pack, realiza el pago y sube la foto del comprobante. Validamos y activamos tu plan.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <Label htmlFor="plan">Qué activas</Label>
            <Select id="plan" value={choiceValue} onChange={(e) => setChoiceValue(e.target.value)}>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {choices.filter((c) => c.group === g).map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="method">Método</Label>
            <Select id="method" value={method} onChange={(e) => setMethod(e.target.value as 'yape' | 'plin')}>
              <option value="yape">Yape</option>
              <option value="plin">Plin</option>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center">
          {method === 'yape' && (
            // QR estático: quien paga escribe el monto. Sin optimizar para que no se recomprima.
            <Image src={YAPE_QR} alt="QR de Yape" width={224} height={218} unoptimized className="w-44 shrink-0 rounded-lg" />
          )}
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Smartphone size={16} /> {method === 'yape' ? 'Escanea el QR o yapea' : 'Plinea'} a este número
            </div>
            <p className="mt-2 text-2xl font-bold tracking-wide">{number}</p>
            <p className="text-sm text-[var(--muted)]">{payName} · {choice ? formatSoles(choice.amountPen) : ''}</p>
            {method === 'yape' && (
              <a href={YAPE_QR} download="yape-mathyu.png" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline">
                <Download size={14} /> Descargar QR
              </a>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="op">Número de operación (opcional)</Label>
          <Input id="op" value={operationCode} onChange={(e) => setOperationCode(e.target.value)} placeholder="Ej. 01234567" />
        </div>

        <div>
          <Label htmlFor="proof">Comprobante (foto o PDF)</Label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--border)] px-4 py-5 hover:bg-[var(--surface)]">
            <Upload size={18} className="text-[var(--muted)]" />
            <span className="text-sm text-[var(--muted)]">{file ? file.name : 'Haz clic para subir tu captura del pago'}</span>
            <input
              id="proof"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          Enviar comprobante
        </Button>
      </form>
    </Card>
  );
}
