'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, CheckCircle2, ImagePlus, Loader2, Plus, Search, UserPlus, X } from 'lucide-react';
import { activatedMessage } from '@/lib/admin-messages';
import { allPurchases, getPlan, PAYMENT_METHODS, PRODUCT_NAME, PRODUCTS, purchaseOf, renewalPurchase, type Purchase } from '@/lib/plans';
import { renewedExpiry } from '@/lib/renewal';
import { upgradeQuote, upgradeTotal } from '@/lib/upgrade';
import { formatDate, formatSoles } from '@/lib/utils';
import { formatPhone } from '@/lib/whatsapp';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert, Input, Label, Select } from '@/components/ui/primitives';
import { Avatar, WhatsAppLink } from './parts';
import { Segmented } from './segmented';

/** Un cliente para elegir al registrar el pago, con sus planes (para calcular hasta cuándo queda). */
export interface ClientOption {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  subs: { product: string; plan: string; monthlyLimit: number | null; expiresAt: string | null }[];
}

const MONTHS = [1, 3, 6, 12] as const;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Registrar pago": el cliente te pagó por fuera (Yape por WhatsApp, transferencia,
 * efectivo) y le activas el plan o pack. Sin `client`, se elige o se crea en el mismo formulario.
 */
export function RegisterPaymentButton({
  client,
  purchase,
  children,
  variant = 'primary',
  size = 'md',
  className,
}: {
  client?: ClientOption;
  purchase?: string;
  children?: ReactNode;
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {children ?? <><Plus size={16} /> <span className="whitespace-nowrap">Registrar<span className="hidden sm:inline"> pago</span></span></>}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar pago"
        description="Te pagó por fuera (Yape o Plin por WhatsApp, transferencia, efectivo): queda aprobado y se activa su plan al instante."
        className="max-w-xl"
      >
        <RegisterPaymentForm client={client} initialPurchase={purchase} onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function RegisterPaymentForm({ client: fixed, initialPurchase, onClose }: { client?: ClientOption; initialPurchase?: string; onClose: () => void }) {
  const router = useRouter();
  const [options, setOptions] = useState<ClientOption[] | null>(fixed ? [fixed] : null);
  const [client, setClient] = useState<ClientOption | null>(fixed ?? null);
  const [query, setQuery] = useState('');
  // Cliente sin cuenta: se crea con este correo.
  const [newClient, setNewClient] = useState<{ email: string; name: string } | null>(null);

  const purchases = useMemo(() => allPurchases(), []);
  const [purchaseValue, setPurchaseValue] = useState(() => {
    const value = initialPurchase ?? (fixed ? renewalPurchase(fixed.subs) : undefined);
    return value && purchaseOf(value) ? value : '';
  });
  const purchase = purchaseOf(purchaseValue);
  const [months, setMonths] = useState<number>(1);
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState('yape_plin');
  const [operationCode, setOperationCode] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [notify, setNotify] = useState(true);
  // Cambio a un plan mayor: cobra la diferencia y mantiene su vencimiento (lib/upgrade.ts).
  const [prorate, setProrate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ userId: string; until: string | null; name: string | null; email: string; phone: string | null; what: string } | null>(null);
  const [now] = useState(() => new Date());

  // Los clientes se piden al abrir (solo si hay que elegir uno).
  useEffect(() => {
    if (fixed) return;
    let alive = true;
    fetch('/api/admin/clients')
      .then((r) => r.json())
      .then((d) => { if (alive) setOptions(d.clients ?? []); })
      .catch(() => { if (alive) setOptions([]); });
    return () => { alive = false; };
  }, [fixed]);

  // Si ya tiene un plan y pasa a uno mayor: la diferencia por los días que le quedan.
  const subs = client?.subs ?? [];
  const quote = purchase && client ? upgradeQuote(subs.map((s) => ({ ...s, expiresAt: s.expiresAt ? new Date(s.expiresAt) : null })), purchase, now) : null;
  const upgrade = quote && prorate && purchase ? upgradeTotal(quote, purchase, months) : null;

  // Monto sugerido: precio de lista × meses (o el del cambio de plan), hasta que el admin lo cambie.
  const suggested = upgrade ? upgrade.amountPen : purchase ? purchase.pricedPen * months : 0;
  const amountValue = amountTouched ? amount : purchase ? String(suggested) : '';

  // Vista previa de la captura; la URL se libera al cambiarla o al cerrar.
  const preview = useMemo(() => (file?.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // Pegar (Ctrl+V) la captura del Yape copiada de WhatsApp, esté donde esté el foco.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file');
      const pasted = item?.getAsFile();
      if (pasted) { e.preventDefault(); pickFile(pasted); }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  function pickFile(f: File | null | undefined) {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) { setError('El comprobante debe ser JPG, PNG, WEBP o PDF'); return; }
    if (f.size > MAX_BYTES) { setError('El comprobante supera los 5 MB'); return; }
    setError(null);
    setFile(f);
  }

  function chooseClient(c: ClientOption) {
    setClient(c);
    setNewClient(null);
    setQuery('');
    if (!purchaseValue) {
      const renewal = renewalPurchase(c.subs);
      if (renewal && purchaseOf(renewal)) setPurchaseValue(renewal);
    }
  }

  // Hasta cuándo queda cada API, con la misma regla que el servidor.
  const result = purchase?.items.map((i) => {
    const current = subs.find((s) => s.product === i.product);
    const until = upgrade ? upgrade.expiresAt : renewedExpiry(current ? { plan: current.plan, expiresAt: current.expiresAt ? new Date(current.expiresAt) : null } : null, i.plan, now, months);
    const replaces = current && current.plan !== i.plan && current.plan !== 'free' && (!current.expiresAt || new Date(current.expiresAt) > now)
      ? `${PRODUCT_NAME[i.product]} ${getPlan(i.product, current.plan)?.name ?? current.plan}`
      : null;
    return { product: i.product, until, replaces };
  }) ?? [];
  const sameUntil = result.every((r) => r.until?.getTime() === result[0]?.until?.getTime());
  const replaced = result.flatMap((r) => (r.replaces ? [r.replaces] : []));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!client && !newClient) { setError('Elige el cliente o escribe su correo'); return; }
    if (!purchase) { setError('Elige qué pagó'); return; }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      if (client) fd.set('userId', client.id);
      else if (newClient) {
        fd.set('email', newClient.email);
        if (newClient.name.trim()) fd.set('name', newClient.name.trim());
      }
      fd.set('purchase', purchase.value);
      fd.set('months', String(months));
      fd.set('amountPen', amountValue || '0');
      fd.set('method', method);
      if (operationCode.trim()) fd.set('operationCode', operationCode.trim());
      if (note.trim()) fd.set('note', note.trim());
      fd.set('notify', notify ? '1' : '0');
      fd.set('prorate', upgrade ? '1' : '0');
      if (file) fd.set('proof', file);
      const res = await fetch('/api/admin/payments', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message ?? 'No se pudo registrar el pago'); return; }
      const until = result.map((r) => r.until).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
      setDone({
        userId: data.userId,
        until: until?.toISOString() ?? null,
        name: client?.name ?? (newClient?.name.trim() || null),
        email: client?.email ?? newClient!.email,
        phone: client?.phone ?? null,
        what: purchase.name,
      });
      router.refresh();
    } catch {
      setError('Sin conexión: inténtalo de nuevo');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <CheckCircle2 size={20} className="mt-px shrink-0 text-green-600" />
          <div>
            <p className="font-semibold">{done.what} activo{done.until ? ` hasta el ${formatDate(done.until)}` : ''}</p>
            <p className="mt-0.5">
              Pago registrado para {done.name ?? done.email}.
              {notify ? ` Le enviamos el correo de confirmación a ${done.email}.` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {done.phone && <WhatsAppLink phone={done.phone} text={activatedMessage(done.name, done.what, done.until)} label="Avisarle por WhatsApp" />}
          <Link href={`/admin/clients/${done.userId}`} onClick={onClose} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--surface)]">
            Ver cliente <ArrowRight size={14} />
          </Link>
          <Button type="button" size="sm" className="ml-auto" onClick={onClose}>Listo</Button>
        </div>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = q && options ? options.filter((c) => c.email.includes(q) || c.name?.toLowerCase().includes(q)).slice(0, 6) : [];
  // Sin la lista cargada no sabemos si ya existe: no se ofrece crearlo todavía.
  const exact = options === null || options.some((c) => c.email === q);
  const groups = ['Packs', ...PRODUCTS.map((p) => PRODUCT_NAME[p])];
  const groupOf = (p: Purchase) => (p.bundle ? 'Packs' : PRODUCT_NAME[p.items[0].product]);

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Cliente */}
      <div>
        <Label htmlFor="rp-client">Cliente</Label>
        {client || newClient ? (
          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            {client ? <Avatar name={client.name} email={client.email} /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700"><UserPlus size={16} /></span>}
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium">{client ? (client.name ?? client.email) : 'Cliente nuevo'}</p>
              <p className="truncate text-xs text-[var(--muted)]">
                {client ? client.email : newClient!.email}
                {client?.phone ? ` · ${formatPhone(client.phone)}` : ''}
              </p>
            </div>
            {!fixed && (
              <button type="button" onClick={() => { setClient(null); setNewClient(null); }} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-white hover:text-[var(--foreground)]" aria-label="Cambiar cliente">
                <X size={16} />
              </button>
            )}
          </div>
        ) : (
          <div>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <Input
                id="rp-client"
                autoFocus
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={options === null ? 'Cargando clientes…' : 'Busca por nombre o correo'}
                className="pl-10"
              />
            </div>
            {(matches.length > 0 || (EMAIL.test(q) && !exact)) && (
              <ul className="mt-2 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => chooseClient(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--surface)]">
                      <Avatar name={c.name} email={c.email} className="h-8 w-8" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.name ?? c.email}</span>
                        <span className="block truncate text-xs text-[var(--muted)]">{c.email}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {EMAIL.test(q) && !exact && (
                  <li>
                    <button type="button" onClick={() => { setNewClient({ email: q, name: '' }); setQuery(''); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-[var(--surface)]">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700"><UserPlus size={15} /></span>
                      <span>Crear cliente nuevo con <b>{q}</b></span>
                    </button>
                  </li>
                )}
              </ul>
            )}
            {q && options && matches.length === 0 && !EMAIL.test(q) && (
              <p className="mt-2 text-xs text-[var(--muted)]">Nadie coincide. Si aún no tiene cuenta, escribe su correo completo para crearla.</p>
            )}
          </div>
        )}
        {newClient && (
          <div className="mt-3">
            <Label htmlFor="rp-name">Nombre (opcional)</Label>
            <Input id="rp-name" value={newClient.name} maxLength={80} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} placeholder="Ej. Diego Ortega" />
            <p className="mt-1.5 text-xs text-[var(--muted)]">Cuando entre con Google o con este correo, verá su plan activo.</p>
          </div>
        )}
      </div>

      {/* Qué pagó */}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <Label htmlFor="rp-purchase">Qué pagó</Label>
          <Select id="rp-purchase" value={purchaseValue} onChange={(e) => setPurchaseValue(e.target.value)} required>
            <option value="" disabled>Elige un plan o un pack</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {purchases.filter((p) => groupOf(p) === g).map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.bundle ? `${p.name} (${p.bundle.items.map((i) => PRODUCT_NAME[i.product]).join(' + ')})` : p.name} — {formatSoles(p.pricedPen)}/mes
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium">Meses</span>
          <Segmented label="Meses" value={months} onChange={setMonths} options={MONTHS.map((m) => ({ value: m, label: String(m) }))} className="sm:w-48" />
        </div>
      </div>

      {quote && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={prorate} onChange={(e) => setProrate(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
          <span>
            Cambio de plan: cobrar solo la diferencia por los {quote.days} {quote.days === 1 ? 'día' : 'días'} que le quedan ({formatSoles(quote.amountPen)}) y mantener su vencimiento del {formatDate(quote.expiresAt)}.
            {months > 1 && ` Los ${months - 1} ${months === 2 ? 'mes extra va' : 'meses extra van'} a precio de lista.`}
          </span>
        </label>
      )}

      {/* Cómo pagó */}
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <div>
          <Label htmlFor="rp-amount">Monto (S/)</Label>
          <Input
            id="rp-amount"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            required
            value={amountValue}
            onChange={(e) => { setAmountTouched(true); setAmount(e.target.value); }}
          />
          {purchase && amountTouched && Number(amountValue) !== suggested && (
            <button type="button" onClick={() => setAmountTouched(false)} className="mt-1 text-xs text-[var(--accent)] hover:underline">
              Lista: {formatSoles(suggested)}
            </button>
          )}
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium">Método</span>
          <Segmented label="Método de pago" value={method} onChange={setMethod} options={Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label }))} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="rp-op">N° de operación (opcional)</Label>
          <Input id="rp-op" maxLength={40} value={operationCode} onChange={(e) => setOperationCode(e.target.value)} placeholder="Ej. 0250568475" />
        </div>
        <div>
          <Label htmlFor="rp-note">Nota interna (opcional)</Label>
          <Input id="rp-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Pagó por WhatsApp" />
        </div>
      </div>

      {/* Comprobante */}
      <div>
        <span className="mb-1.5 block text-sm font-medium">Comprobante (opcional)</span>
        {file ? (
          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-2.5">
            {preview
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
              ? <img src={preview} alt="Vista previa del comprobante" className="h-16 w-16 rounded-lg object-cover" />
              : <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-[var(--surface)] text-xs font-semibold text-[var(--muted)]">PDF</span>}
            <span className="min-w-0 flex-1 truncate text-sm">{file.name || 'Captura pegada'}</span>
            <button type="button" onClick={() => setFile(null)} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface)]" aria-label="Quitar comprobante"><X size={16} /></button>
          </div>
        ) : (
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files[0]); }}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--border)] px-4 py-3.5 text-sm text-[var(--muted)] hover:bg-[var(--surface)]"
          >
            <ImagePlus size={18} />
            <span>Sube la captura, arrástrala o <b className="font-medium text-[var(--foreground)]">pégala con Ctrl+V</b></span>
            <input type="file" accept={ALLOWED.join(',')} className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        )}
      </div>

      {/* Resultado */}
      {purchase && (
        <div className="rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-sm">
          <p>
            <b>{purchase.name}</b>{' '}
            {sameUntil
              ? result[0]?.until ? <>queda activo hasta el <b>{formatDate(result[0].until)}</b>.</> : <>queda sin vencimiento.</>
              : <>queda activo: {result.map((r) => `${PRODUCT_NAME[r.product]} hasta el ${r.until ? formatDate(r.until) : '—'}`).join(' · ')}.</>}
            {(client || newClient) && !replaced.length && result.some((r) => subs.some((s) => s.product === r.product && s.plan !== 'free')) && ' Se suma a lo que ya tenía.'}
          </p>
          {replaced.length > 0 && <p className="mt-1 text-amber-800">Reemplaza su plan actual: {replaced.join(', ')}.</p>}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
        Enviarle el correo de pago confirmado
      </label>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button type="submit" disabled={busy || (!client && !newClient) || !purchase}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          Registrar y activar
        </Button>
      </div>
    </form>
  );
}

