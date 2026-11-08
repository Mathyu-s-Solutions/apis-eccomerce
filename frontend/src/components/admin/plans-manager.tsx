'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import {
  BUNDLES,
  getPlan,
  groupByBundle,
  PAYMENT_METHODS,
  PLANS,
  PRODUCT_NAME,
  PRODUCTS,
  type Bundle,
  type Product,
} from '@/lib/plans';
import { renewedExpiry } from '@/lib/renewal';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, Input, Label, Select } from '@/components/ui/primitives';
import { formatDate, formatNumber } from '@/lib/utils';

interface AdminSubscription {
  id: string;
  product: Product;
  plan: string;
  monthlyLimit: number | null;
  expiresAt: string | null;
  userId: string;
  userEmail: string;
  userName: string | null;
}

interface Client {
  userId: string;
  userEmail: string;
  userName: string | null;
  subs: AdminSubscription[];
}

/** Un pack completo del cliente o el plan de una API. */
interface PlanGroup {
  bundle?: Bundle;
  subs: AdminSubscription[];
}

const groupKey = (g: PlanGroup) => (g.bundle ? `bundle:${g.bundle.id}` : g.subs[0].product);
const groupName = (g: PlanGroup) => (g.bundle ? g.bundle.name : (PRODUCT_NAME[g.subs[0].product] ?? g.subs[0].product));
const isActive = (s: AdminSubscription, now: number) => !s.expiresAt || new Date(s.expiresAt).getTime() > now;

/** "vence 25 nov. 2026", o la de cada API si no vencen el mismo día. */
function datesText(group: PlanGroup, dates: (string | Date | null)[], text: (d: string | Date | null, i: number) => string): string {
  const texts = dates.map(text);
  if (texts.every((t) => t === texts[0])) return texts[0];
  return group.subs.map((s, i) => `${PRODUCT_NAME[s.product] ?? s.product} ${texts[i]}`).join(' · ');
}

/** Asignar o quitar el plan de un cliente a mano, y registrar los pagos que hizo por fuera. */
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
  // Plan con el formulario de pago abierto: `${userId}:${groupKey}`.
  const [paying, setPaying] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/subscriptions');
    const data = await res.json();
    setSubs(data.subscriptions ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Un cliente por fila, con sus planes agrupados como los compra (el pack junto).
  const clients = useMemo(() => {
    const byUser = new Map<string, Client>();
    for (const s of subs ?? []) {
      const client = byUser.get(s.userId) ?? { userId: s.userId, userEmail: s.userEmail, userName: s.userName, subs: [] };
      client.subs.push(s);
      byUser.set(s.userId, client);
    }
    return [...byUser.values()].map((c) => ({ ...c, groups: groupByBundle(c.subs) }));
  }, [subs]);

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

      {notice && <Alert tone="success">{notice}</Alert>}

      {subs === null ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
      ) : clients.length === 0 ? (
        <Card className="p-6 text-sm text-[var(--muted)]">Ningún cliente tiene un plan de pago todavía.</Card>
      ) : (
        <Card className="divide-y divide-[var(--border)]">
          {clients.map((c) => {
            const open = c.groups.find((g) => paying === `${c.userId}:${groupKey(g)}`);
            return (
              <div key={c.userId} className="px-5 py-3.5 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.userName ?? c.userEmail}</p>
                    <p className="text-xs text-[var(--muted)]">{c.userEmail}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {c.groups.map((g) => {
                      const key = `${c.userId}:${groupKey(g)}`;
                      const active = g.subs.every((s) => isActive(s, now));
                      const first = g.subs[0];
                      const expiry = datesText(g, g.subs.map((s) => s.expiresAt), (d, i) =>
                        d ? `${isActive(g.subs[i], now) ? 'vence' : 'venció'} ${formatDate(d)}` : 'sin vencimiento');
                      return (
                        <div key={key} className="flex flex-wrap items-center justify-end gap-2">
                          <span className="font-medium">{groupName(g)}</span>
                          <Badge tone={active ? 'accent' : 'danger'}>
                            {g.bundle ? g.bundle.description : (PLANS[first.product]?.find((p) => p.id === first.plan)?.name ?? first.plan)}
                          </Badge>
                          <span className="text-xs text-[var(--muted)]">
                            {g.bundle ? expiry : `${formatNumber(first.monthlyLimit)}/mes · ${expiry}`}
                          </span>
                          {/* Un plan sin vencimiento no se renueva. */}
                          {g.subs.every((s) => s.expiresAt) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => { setNotice(null); setPaying(paying === key ? null : key); }}
                            >
                              <Check size={14} /> Ya pagó
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {open && (
                  <PaymentForm
                    key={paying}
                    client={c}
                    group={open}
                    now={now}
                    onCancel={() => setPaying(null)}
                    onDone={async (text) => { setPaying(null); setNotice(text); await load(); }}
                  />
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

/**
 * Registra un pago que el cliente hizo por fuera (sin subir comprobante): queda
 * aprobado en su historial y renueva el pack o el plan un mes, en su mismo día.
 */
function PaymentForm({ client, group, now, onCancel, onDone }: {
  client: Client;
  group: PlanGroup;
  now: number;
  onCancel: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const id = useId();
  const first = group.subs[0];
  const [method, setMethod] = useState('yape');
  const [amount, setAmount] = useState(String(group.bundle ? group.bundle.pricedPen : (getPlan(first.product, first.plan)?.pricedPen ?? 0)));
  const [operationCode, setOperationCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hasta cuándo queda, con la misma regla que al aprobar un comprobante.
  const renewed = group.subs.map((s) => renewedExpiry({ plan: s.plan, expiresAt: s.expiresAt ? new Date(s.expiresAt) : null }, s.plan, new Date(now)));
  const until = datesText(group, renewed, (d) => (d ? `hasta el ${formatDate(d)}` : 'sin vencimiento'));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: client.userId,
          product: groupKey(group),
          method,
          amountPen: Number(amount),
          operationCode: operationCode.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message ?? 'No se pudo registrar el pago'); return; }
      await onDone(`Pago registrado: ${groupName(group)} de ${client.userName ?? client.userEmail} queda ${until}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="mb-3">
        <b>{groupName(group)}</b>: el pago queda aprobado en su historial y el plan se renueva <b>{until}</b>.
      </p>
      <div className="grid gap-3 sm:grid-cols-[150px_120px_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor={`${id}-method`}>Método</Label>
          <Select id={`${id}-method`} value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(PAYMENT_METHODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${id}-amount`}>Monto (S/)</Label>
          <Input id={`${id}-amount`} type="number" min={0} step={1} required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${id}-op`}>N° de operación (opcional)</Label>
          <Input id={`${id}-op`} maxLength={40} value={operationCode} onChange={(e) => setOperationCode(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Confirmar
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
        </div>
      </div>
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
    </form>
  );
}
