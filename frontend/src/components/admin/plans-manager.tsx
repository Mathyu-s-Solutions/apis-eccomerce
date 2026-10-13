'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BUNDLES, PLANS, PRODUCT_NAME, PRODUCTS, type Product } from '@/lib/plans';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, Input, Label, Select } from '@/components/ui/primitives';
import { formatDate, formatNumber } from '@/lib/utils';

interface AdminSubscription {
  id: string;
  product: Product;
  plan: string;
  monthlyLimit: number | null;
  expiresAt: string | null;
  userEmail: string;
  userName: string | null;
}

/** Asignar o quitar el plan de un cliente a mano (sin pago de por medio). */
export function PlansManager() {
  const [subs, setSubs] = useState<AdminSubscription[] | null>(null);
  const [email, setEmail] = useState('');
  // Una API o un pack ("bundle:<id>", asigna los planes del pack).
  const [product, setProduct] = useState<string>('shalom');
  const [plan, setPlan] = useState('basico');
  // Meses, 0 = sin vencimiento, -1 = hasta una fecha.
  const [months, setMonths] = useState(1);
  const [until, setUntil] = useState('');
  const bundle = product.startsWith('bundle:') ? BUNDLES.find((b) => `bundle:${b.id}` === product) : undefined;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/subscriptions');
    const data = await res.json();
    setSubs(data.subscriptions ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, product, plan: bundle ? 'pack' : plan, months: Math.max(0, months), ...(months === -1 ? { until } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ tone: 'error', text: data.message ?? 'No se pudo guardar' }); return; }
      setMessage({ tone: 'success', text: !bundle && plan === 'free' ? 'Plan quitado: rige el gratis.' : months === -1 ? 'Plan asignado: se renueva ese día de cada mes.' : 'Plan asignado.' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <form onSubmit={save} className="grid gap-4 md:grid-cols-[1fr_170px_190px_170px_auto] md:items-end">
          <div>
            <Label htmlFor="sub-email">Correo del cliente</Label>
            <Input id="sub-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@correo.com" />
          </div>
          <div>
            <Label htmlFor="sub-product">API</Label>
            <Select id="sub-product" value={product} onChange={(e) => { setProduct(e.target.value); setPlan('basico'); }}>
              {PRODUCTS.map((p) => <option key={p} value={p}>{PRODUCT_NAME[p]}</option>)}
              {BUNDLES.map((b) => <option key={b.id} value={`bundle:${b.id}`}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="sub-plan">Plan</Label>
            {bundle ? (
              <Input id="sub-plan" disabled value={bundle.description} />
            ) : (
              <Select id="sub-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
                {PLANS[product as Product].map((p) => (
                  <option key={p.id} value={p.id}>{p.id === 'free' ? 'Quitar (gratis)' : `${p.name} · ${formatNumber(p.monthlyLimit)}/mes`}</option>
                ))}
              </Select>
            )}
          </div>
          <div>
            <Label htmlFor="sub-months">Duración</Label>
            <Select id="sub-months" value={months} disabled={!bundle && plan === 'free'} onChange={(e) => setMonths(Number(e.target.value))}>
              <option value={1}>1 mes</option>
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
              <option value={12}>12 meses</option>
              <option value={-1}>Hasta una fecha…</option>
              <option value={0}>Sin vencimiento</option>
            </Select>
            {months === -1 && (
              <Input className="mt-2" type="date" required value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Vence el" />
            )}
          </div>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />} Guardar
          </Button>
        </form>
        {message && <div className="mt-3"><Alert tone={message.tone}>{message.text}</Alert></div>}
      </Card>

      {subs === null ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
      ) : subs.length === 0 ? (
        <Card className="p-6 text-sm text-[var(--muted)]">Ningún cliente tiene un plan de pago todavía.</Card>
      ) : (
        <Card className="divide-y divide-[var(--border)]">
          {subs.map((s) => {
            const active = !s.expiresAt || new Date(s.expiresAt).getTime() > now;
            return (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                <div>
                  <p className="font-medium">{s.userName ?? s.userEmail}</p>
                  <p className="text-xs text-[var(--muted)]">{s.userEmail}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{PRODUCT_NAME[s.product] ?? s.product}</span>
                  <Badge tone={active ? 'accent' : 'danger'}>{PLANS[s.product]?.find((p) => p.id === s.plan)?.name ?? s.plan}</Badge>
                  <span className="text-xs text-[var(--muted)]">
                    {formatNumber(s.monthlyLimit)}/mes · {s.expiresAt ? `${active ? 'vence' : 'venció'} ${formatDate(s.expiresAt)}` : 'sin vencimiento'}
                  </span>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
