'use client';

import { useState } from 'react';
import { Ban, Loader2 } from 'lucide-react';
import type { ClientKey } from '@/lib/admin';
import { isProduct } from '@/lib/plans';
import { cn, formatDate, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Card } from '@/components/ui/primitives';
import { ApiName, Empty } from './parts';
import { useAdminAction } from './toast';

/**
 * Keys del cliente con su consumo del mes. El admin puede desactivar una (p. ej. por
 * abuso), no reactivarla: pudo revocarla el cliente. Si hace falta, crea otra.
 */
export function ClientKeys({ keys }: { keys: ClientKey[] }) {
  const run = useAdminAction();
  const [confirm, setConfirm] = useState<ClientKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function disable(k: ClientKey) {
    setBusy(true);
    const ok = await run(`/api/admin/keys/${k.id}`, { method: 'PATCH', json: { enabled: false } }, `Key ${k.prefix}… desactivada: la API ya no la acepta.`);
    setBusy(false);
    if (ok) setConfirm(null);
  }

  return (
    <Card className="divide-y divide-[var(--border)] overflow-hidden">
      {keys.length === 0 ? (
        <Empty>No ha creado API keys.</Empty>
      ) : (
        keys.map((k) => (
          <div key={k.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm', !k.enabled && 'bg-[var(--surface)] text-[var(--muted)]')}>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{k.name}</span>
                <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-xs">{k.prefix}…</code>
                {!k.enabled && <Badge>Desactivada</Badge>}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--muted)]">
                {isProduct(k.product) ? <ApiName product={k.product} /> : <span>Todas las APIs</span>}
                <span>· {formatNumber(k.used)} este mes · creada el {formatDate(k.createdAt)}</span>
              </p>
            </div>
            {k.enabled && (
              <Button size="sm" variant="ghost" className="h-8 text-xs text-red-600 hover:text-red-700" onClick={() => setConfirm(k)}>
                <Ban size={14} /> Desactivar
              </Button>
            )}
          </div>
        ))
      )}
      {confirm && (
        <Dialog open onClose={() => setConfirm(null)} title={`Desactivar la key «${confirm.name}»`}>
          <p className="text-sm text-[var(--muted)]">
            La API deja de aceptar <code className="rounded bg-[var(--surface)] px-1 text-xs">{confirm.prefix}…</code> al instante y no se puede reactivar:
            si fue un error, el cliente crea otra key desde su panel. No se le avisa.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>Cancelar</Button>
            <Button variant="danger" onClick={() => disable(confirm)} disabled={busy}>
              {busy && <Loader2 size={16} className="animate-spin" />} Desactivar key
            </Button>
          </div>
        </Dialog>
      )}
    </Card>
  );
}
