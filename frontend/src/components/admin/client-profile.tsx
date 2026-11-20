'use client';

import { useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { formatPhone } from '@/lib/whatsapp';
import { Button } from '@/components/ui/button';
import { Card, Input, Label, Textarea } from '@/components/ui/primitives';
import { useAdminAction } from './toast';

/** Nombre, WhatsApp y notas internas del cliente (él no las ve). */
export function ClientProfile({ id, name, phone, note }: { id: string; name: string | null; phone: string | null; note: string | null }) {
  const run = useAdminAction();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await run(`/api/admin/clients/${id}`, {
      method: 'PATCH',
      json: { name: String(form.get('name') ?? ''), phone: String(form.get('phone') ?? ''), note: String(form.get('note') ?? '') },
    }, 'Datos del cliente guardados.');
    setBusy(false);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <Card className="p-5">
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cp-name">Nombre</Label>
              <Input id="cp-name" name="name" defaultValue={name ?? ''} maxLength={80} />
            </div>
            <div>
              <Label htmlFor="cp-phone">WhatsApp</Label>
              <Input id="cp-phone" name="phone" inputMode="tel" defaultValue={phone ? formatPhone(phone) : ''} maxLength={30} placeholder="987 654 321" />
            </div>
          </div>
          <div>
            <Label htmlFor="cp-note">Notas internas</Label>
            <Textarea id="cp-note" name="note" rows={4} defaultValue={note ?? ''} maxLength={2000} placeholder="Qué tienda tiene, cómo paga, acuerdos…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />} Guardar</Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold">Datos y notas</h2>
        <Button variant="ghost" size="sm" className="-mr-2 -mt-1 h-8" onClick={() => setEditing(true)}>
          <Pencil size={14} /> Editar
        </Button>
      </div>
      <dl className="mt-3 space-y-2.5 text-sm">
        <div>
          <dt className="text-xs text-[var(--muted)]">WhatsApp</dt>
          <dd>{phone ? formatPhone(phone) : <button onClick={() => setEditing(true)} className="text-[var(--accent)] hover:underline">Agregar su número</button>}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted)]">Notas</dt>
          <dd className="whitespace-pre-line">{note || <span className="text-[var(--muted)]">Sin notas.</span>}</dd>
        </div>
      </dl>
    </Card>
  );
}
