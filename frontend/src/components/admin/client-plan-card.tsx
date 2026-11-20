'use client';

import { useState } from 'react';
import { CalendarPlus, Gauge, Gift, KeyRound, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import type { SubView } from '@/lib/admin';
import { BRANDS } from '@/lib/brands';
import { BUNDLES, freePlan, getPlan, groupByBundle, PLANS, PRODUCT_NAME, purchaseOf, renewalPurchase, type Product } from '@/lib/plans';
import { addMonthsKeepingDay, endOfLimaDay, extendedExpiry, limaDay, limaDaysUntil, relativeExpiry } from '@/lib/renewal';
import { formatDate, formatNumber, formatSoles } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Card, Input, Label, Select } from '@/components/ui/primitives';
import { UsageBar } from '@/components/dashboard/usage-bar';
import { ActionsMenu } from './menu';
import { RegisterPaymentButton, type ClientOption } from './register-payment';
import { Segmented } from './segmented';
import { useAdminAction } from './toast';

type Modal = 'assign' | 'extend' | 'quota' | 'reset' | 'remove';
const DAY_MS = 86_400_000;

/** Una API del cliente: su plan, su consumo del mes y lo que el admin puede cambiarle. */
export function ClientPlanCard({ client, subs, product, used, keys }: {
  client: ClientOption;
  subs: SubView[];
  product: Product;
  used: number;
  keys: number;
}) {
  const [modal, setModal] = useState<Modal | null>(null);
  const [now] = useState(() => new Date());
  const sub = subs.find((s) => s.product === product);
  const paid = !!sub && sub.paid && sub.active;
  const lapsed = !!sub && sub.paid && !sub.active;
  const customTrial = !!sub && !sub.paid && sub.active;
  const free = freePlan(product).monthlyLimit;
  const limit = sub?.active ? sub.monthlyLimit : free;
  const catalog = paid ? getPlan(product, sub.plan)?.monthlyLimit : undefined;
  // Si es parte de un pack, el pack se extiende junto.
  const group = groupByBundle(subs.filter((s) => s.paid)).find((g) => g.subs.some((s) => s.product === product));
  const days = sub?.expiresAt ? limaDaysUntil(new Date(sub.expiresAt), now) : null;

  const renew = renewalPurchase(subs, product);
  const purchase = (paid || lapsed) && renew && purchaseOf(renew) ? renew : `plan:${product}:${PLANS[product].find((p) => p.highlight)?.id ?? 'basico'}`;

  let status: string;
  if (paid) status = sub.expiresAt ? `Vigente hasta el ${formatDate(sub.expiresAt)}` : 'Sin vencimiento';
  else if (lapsed) status = `Venció el ${formatDate(sub.expiresAt!)}: rige la prueba`;
  else if (customTrial) status = `Prueba con cuota a medida (la estándar es ${formatNumber(free)})`;
  else status = 'Prueba estándar, sin costo';

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block h-1.5 w-10 rounded-full" style={{ background: BRANDS[product].theme.signature }} />
          <h3 className="mt-3 font-semibold">{PRODUCT_NAME[product]}</h3>
          <p className={`text-xs ${lapsed ? 'text-red-700' : paid && days !== null && days <= 7 ? 'font-medium text-amber-700' : 'text-[var(--muted)]'}`}>
            {status}
            {paid && days !== null && days <= 7 ? ` · ${relativeExpiry(new Date(sub.expiresAt!), now)}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={paid ? 'accent' : lapsed ? 'danger' : 'neutral'}>{paid ? sub.planName : 'Prueba'}</Badge>
          {group?.bundle && paid && <span className="text-[11px] text-[var(--muted)]">{group.bundle.name}</span>}
        </div>
      </div>

      <UsageBar used={used} limit={limit} />
      <p className="-mt-2 flex flex-wrap items-center gap-x-2 text-xs text-[var(--muted)]">
        <span className="inline-flex items-center gap-1"><KeyRound size={12} /> {keys === 0 ? 'Sin keys para esta API' : `${keys} ${keys === 1 ? 'key activa' : 'keys activas'}`}</span>
        {catalog !== undefined && limit !== catalog && <span>· cuota a medida (plan: {formatNumber(catalog)})</span>}
      </p>

      <div className="mt-auto flex items-center gap-2">
        <RegisterPaymentButton client={client} purchase={purchase} size="sm" variant={paid ? 'outline' : 'primary'} className="flex-1">
          {paid || lapsed ? 'Renovar (registrar pago)' : 'Activar plan (registrar pago)'}
        </RegisterPaymentButton>
        <ActionsMenu
          label={`Más acciones de ${PRODUCT_NAME[product]}`}
          items={[
            { label: 'Asignar plan sin pago', icon: <Gift size={16} />, onSelect: () => setModal('assign') },
            { label: 'Extender días', icon: <CalendarPlus size={16} />, onSelect: () => setModal('extend'), hidden: !(paid || lapsed) || !sub?.expiresAt },
            // Con un plan vencido, la cuota de prueba borraría su vencimiento (y su día de renovación): primero se renueva o se quita.
            { label: paid ? 'Ajustar cuota del plan' : 'Subir cuota de prueba', icon: <Gauge size={16} />, onSelect: () => setModal('quota'), hidden: lapsed },
            { label: 'Reiniciar consumo del mes', icon: <RotateCcw size={16} />, onSelect: () => setModal('reset'), hidden: used === 0 },
            { label: customTrial ? 'Volver a la prueba estándar' : 'Quitar plan', icon: <Trash2 size={16} />, onSelect: () => setModal('remove'), hidden: !sub, danger: true },
          ]}
        />
      </div>

      {/* Cada diálogo se monta al abrirse: parte siempre de los datos actuales. */}
      {modal === 'assign' && <AssignDialog open onClose={() => setModal(null)} clientId={client.id} product={product} subs={subs} />}
      {modal === 'extend' && sub?.expiresAt && (
        <ExtendDialog
          open
          onClose={() => setModal(null)}
          clientId={client.id}
          products={group?.bundle ? group.subs.map((s) => s.product) : [product]}
          what={group?.bundle ? group.bundle.name : `${PRODUCT_NAME[product]} ${sub.planName}`}
          expiresAt={sub.expiresAt}
        />
      )}
      {modal === 'quota' && <QuotaDialog open onClose={() => setModal(null)} clientId={client.id} product={product} paid={paid} planName={sub?.planName} current={limit} catalog={catalog} used={used} />}
      {modal === 'reset' && <ConfirmDialog
        open
        onClose={() => setModal(null)}
        title={`Reiniciar consumo de ${PRODUCT_NAME[product]}`}
        text={`Lleva ${formatNumber(used)} ${used === 1 ? 'consulta' : 'consultas'} este mes. Vuelve a 0 y puede usar de nuevo toda su cuota (${formatNumber(limit)}).`}
        confirm="Reiniciar consumo"
        request={{ clientId: client.id, json: { action: 'reset-usage', product } }}
      />}
      {modal === 'remove' && <ConfirmDialog
        open
        onClose={() => setModal(null)}
        title={customTrial ? 'Volver a la prueba estándar' : `Quitar ${PRODUCT_NAME[product]} ${sub?.planName ?? ''}`}
        text={customTrial
          ? `Su cuota de ${PRODUCT_NAME[product]} vuelve a ${formatNumber(free)} consultas al mes.`
          : `Pasa al plan de prueba (${formatNumber(free)} consultas al mes) desde ya. No se le avisa ni se toca su historial de pagos.`}
        confirm={customTrial ? 'Volver a la estándar' : 'Quitar plan'}
        danger
        request={{ clientId: client.id, json: { action: 'remove', product } }}
      />}
    </Card>
  );
}

function useSubmit(clientId: string, onClose: () => void) {
  const run = useAdminAction();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    submit: async (json: Record<string, unknown>) => {
      setBusy(true);
      const ok = await run(`/api/admin/clients/${clientId}/plans`, { json });
      setBusy(false);
      if (ok) onClose();
    },
  };
}

function Actions({ busy, onClose, label, danger }: { busy: boolean; onClose: () => void; label: string; danger?: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
      <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />} {label}</Button>
    </div>
  );
}

type Duration = '1' | '3' | '6' | '12' | 'until' | 'forever';

/** Plan o pack sin pago (cortesía, cliente propio, prueba extendida de un plan). */
function AssignDialog({ open, onClose, clientId, product, subs }: { open: boolean; onClose: () => void; clientId: string; product: Product; subs: SubView[] }) {
  const { busy, submit } = useSubmit(clientId, onClose);
  const options = [
    ...PLANS[product].filter((p) => p.pricedPen > 0).map((p) => ({ value: `plan:${product}:${p.id}`, label: `${PRODUCT_NAME[product]} ${p.name} · ${p.monthlyLimit === null ? 'ilimitado' : `${formatNumber(p.monthlyLimit)}/mes`}` })),
    ...BUNDLES.filter((b) => b.items.some((i) => i.product === product)).map((b) => ({ value: `bundle:${b.id}`, label: `${b.name} (${b.description})` })),
  ];
  const [value, setValue] = useState(options[0].value);
  const [duration, setDuration] = useState<Duration>('1');
  const [until, setUntil] = useState('');
  const [now] = useState(() => new Date());
  const tomorrow = limaDay(new Date(now.getTime() + DAY_MS));
  // Lo que reemplaza: planes de pago vigentes de esas APIs (puede acortarlos o cambiarlos).
  const newExpiry = duration === 'forever' ? null : duration === 'until' ? (until ? endOfLimaDay(until) : undefined) : addMonthsKeepingDay(now, Number(duration));
  const replaced = (purchaseOf(value)?.items ?? []).flatMap((i) => {
    const s = subs.find((x) => x.product === i.product && x.paid && x.active);
    if (!s) return [];
    const shorter = newExpiry !== undefined && (!s.expiresAt || (newExpiry !== null && newExpiry < new Date(s.expiresAt)));
    return s.plan !== i.plan || shorter
      ? [`${PRODUCT_NAME[s.product]} ${s.planName} (${s.expiresAt ? `vence el ${formatDate(s.expiresAt)}` : 'sin vencimiento'})`]
      : [];
  });

  return (
    <Dialog open={open} onClose={onClose} title="Asignar plan sin pago" description="Para una cortesía o un cliente propio. No queda como pago ni le llega correo; si te pagó, usa «Registrar pago».">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit({ action: 'assign', purchase: value, months: duration === 'forever' || duration === 'until' ? 0 : Number(duration), ...(duration === 'until' ? { until } : {}) });
        }}
        className="space-y-4"
      >
        <div>
          <Label htmlFor={`assign-${product}`}>Plan</Label>
          <Select id={`assign-${product}`} value={value} onChange={(e) => setValue(e.target.value)}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium">Duración</span>
          <Segmented
            label="Duración"
            value={duration}
            onChange={setDuration}
            options={[
              { value: '1', label: '1 mes' }, { value: '3', label: '3' }, { value: '6', label: '6' }, { value: '12', label: '12' },
              { value: 'until', label: 'Fecha' }, { value: 'forever', label: 'Sin fin' },
            ]}
          />
          {duration === 'until' && (
            <Input className="mt-2" type="date" required min={tomorrow} value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Vence el" />
          )}
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            {duration === 'forever' ? 'No vence ni recibe avisos de vencimiento.' : 'Empieza hoy y reemplaza lo que tenga en esas APIs.'}
          </p>
        </div>
        {replaced.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Ojo: reemplaza su plan actual {replaced.join(' y ')}. Si solo quieres darle días extra, usa «Extender días».
          </p>
        )}
        <Actions busy={busy} onClose={onClose} label="Asignar" />
      </form>
    </Dialog>
  );
}

/** Días de regalo sobre el vencimiento. */
function ExtendDialog({ open, onClose, clientId, products, what, expiresAt }: {
  open: boolean; onClose: () => void; clientId: string; products: Product[]; what: string; expiresAt: string;
}) {
  const { busy, submit } = useSubmit(clientId, onClose);
  const [days, setDays] = useState('7');
  const [now] = useState(() => new Date());
  const n = Math.max(1, Math.min(366, Number(days) || 0));
  const next = extendedExpiry(new Date(expiresAt), n, now);
  return (
    <Dialog open={open} onClose={onClose} title={`Extender ${what}`} description={`Hoy ${new Date(expiresAt) > now ? 'vence' : 'venció'} el ${formatDate(expiresAt)}. Sin pago de por medio.`}>
      <form onSubmit={(e) => { e.preventDefault(); submit({ action: 'extend', products, days: n }); }} className="space-y-4">
        <div>
          <span className="mb-1.5 block text-sm font-medium">Días</span>
          <div className="flex gap-2">
            <Segmented label="Días" value={['3', '7', '15', '30'].includes(days) ? days : ''} onChange={setDays} options={['3', '7', '15', '30'].map((d) => ({ value: d, label: d }))} />
            <Input type="number" min={1} max={366} value={days} onChange={(e) => setDays(e.target.value)} aria-label="Otro número de días" className="h-[42px] w-24" />
          </div>
        </div>
        <p className="rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-sm">
          Queda activo hasta el <b>{formatDate(next)}</b>.{products.length > 1 ? ' Se extiende todo el pack (cada API desde su vencimiento).' : ''}
        </p>
        <Actions busy={busy} onClose={onClose} label={`Extender ${n} ${n === 1 ? 'día' : 'días'}`} />
      </form>
    </Dialog>
  );
}

/** Cuota a medida: la del plan de pago, o la de prueba si no tiene plan. */
function QuotaDialog({ open, onClose, clientId, product, paid, planName, current, catalog, used }: {
  open: boolean; onClose: () => void; clientId: string; product: Product; paid: boolean; planName?: string;
  current: number | null; catalog?: number | null; used: number;
}) {
  const { busy, submit } = useSubmit(clientId, onClose);
  const free = freePlan(product).monthlyLimit!;
  const [unlimited, setUnlimited] = useState(current === null);
  const [value, setValue] = useState(String(current ?? free));
  const presets = paid ? [] : [free, 50, 100, 200, 500].filter((v, i, a) => a.indexOf(v) === i);
  const n = Math.max(0, Math.floor(Number(value) || 0));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={paid ? `Cuota de ${PRODUCT_NAME[product]} ${planName}` : `Cuota de prueba de ${PRODUCT_NAME[product]}`}
      description={paid
        ? `Consultas al mes de su plan (el catálogo da ${catalog === null || catalog === undefined ? 'ilimitadas' : formatNumber(catalog)}). Se mantiene al renovar el mismo plan.`
        : `La estándar es ${formatNumber(free)} al mes. Súbela para que pruebe más: no vence, queda hasta que active un plan.`}
    >
      <form onSubmit={(e) => { e.preventDefault(); submit({ action: 'quota', product, monthlyLimit: unlimited ? null : n }); }} className="space-y-4">
        {presets.length > 0 && (
          <Segmented label="Cuotas sugeridas" value={unlimited ? '' : value} onChange={(v) => { setUnlimited(false); setValue(v); }} options={presets.map((p) => ({ value: String(p), label: p === free ? `${p} (estándar)` : String(p) }))} />
        )}
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <div>
            <Label htmlFor={`quota-${product}`}>Consultas al mes</Label>
            <Input id={`quota-${product}`} type="number" min={0} step={1} required={!unlimited} disabled={unlimited} value={unlimited ? '' : value} onChange={(e) => setValue(e.target.value)} placeholder="Ilimitadas" />
          </div>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Ilimitadas
          </label>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Este mes lleva {formatNumber(used)}.{' '}
          {!unlimited && n < used ? 'Con esa cuota queda sin saldo hasta el próximo mes (o reinicia su consumo).' : ''}
          {!paid && ` El plan Básico cuesta ${formatSoles(getPlan(product, 'basico')?.pricedPen ?? 0)}/mes.`}
        </p>
        <Actions busy={busy} onClose={onClose} label="Guardar cuota" />
      </form>
    </Dialog>
  );
}

function ConfirmDialog({ open, onClose, title, text, confirm, danger, request }: {
  open: boolean; onClose: () => void; title: string; text: string; confirm: string; danger?: boolean;
  request: { clientId: string; json: Record<string, unknown> };
}) {
  const { busy, submit } = useSubmit(request.clientId, onClose);
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form onSubmit={(e) => { e.preventDefault(); submit(request.json); }} className="space-y-4">
        <p className="text-sm text-[var(--muted)]">{text}</p>
        <Actions busy={busy} onClose={onClose} label={confirm} danger={danger} />
      </form>
    </Dialog>
  );
}
