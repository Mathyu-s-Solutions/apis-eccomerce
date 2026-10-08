'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Smartphone, Upload } from 'lucide-react';
import type { Plan } from '@/lib/plans';
import { Button } from '@/components/ui/button';
import { Card, Input, Label, Select, Alert } from '@/components/ui/primitives';
import { formatSoles } from '@/lib/utils';

interface Props {
  product: string;
  plans: Plan[];
  initialPlan?: string;
  yape: string;
  plin: string;
  payName: string;
}

export function PaymentForm({ product, plans, initialPlan, yape, plin, payName }: Props) {
  const router = useRouter();
  const paid = plans.filter((p) => p.pricedPen > 0);
  const [planId, setPlanId] = useState(initialPlan && paid.some((p) => p.id === initialPlan) ? initialPlan : paid[0]?.id);
  const [method, setMethod] = useState<'yape' | 'plin'>('yape');
  const [operationCode, setOperationCode] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const plan = paid.find((p) => p.id === planId);
  const number = method === 'yape' ? yape : plin;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) { setError('Sube la foto del comprobante'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set('product', product);
      fd.set('plan', planId!);
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
        ¡Recibimos tu comprobante! Lo validaremos pronto y activaremos tu nueva cuota. Puedes ver el estado abajo.
      </Alert>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Pagar con Yape o Plin</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Elige tu plan, realiza el pago y sube la foto del comprobante. Validamos y activamos tu cuota.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="plan">Plan</Label>
            <Select id="plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {paid.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {formatSoles(p.pricedPen)}/mes</option>
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

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><Smartphone size={16} /> {method === 'yape' ? 'Yapea' : 'Plinea'} a este número</div>
          <p className="mt-2 text-2xl font-bold tracking-wide">{number}</p>
          <p className="text-sm text-[var(--muted)]">{payName} · {plan ? formatSoles(plan.pricedPen) : ''}</p>
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
