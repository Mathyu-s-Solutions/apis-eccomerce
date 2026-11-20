'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert, Input, Label } from '@/components/ui/primitives';

/** Crea un cliente antes de que se registre (p. ej. te escribió por WhatsApp). */
export function NewClientButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: String(form.get('email') ?? ''),
          name: String(form.get('name') ?? '') || undefined,
          phone: String(form.get('phone') ?? '') || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      // Ya existe: lo abrimos.
      if (res.status === 409 && data.userId) { router.push(`/admin/clients/${data.userId}`); return; }
      if (!res.ok) { setError(data.message ?? 'No se pudo crear'); return; }
      router.push(`/admin/clients/${data.userId}`);
    } catch {
      setError('Sin conexión: inténtalo de nuevo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => { setError(null); setOpen(true); }}>
        <UserPlus size={16} /> Nuevo cliente
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo cliente"
        description="Para alguien que aún no se registra. Cuando entre con Google o con este correo, encontrará su cuenta con lo que le asignes."
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="nc-email">Correo</Label>
            <Input id="nc-email" name="email" type="email" required autoFocus placeholder="cliente@correo.com" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="nc-name">Nombre (opcional)</Label>
              <Input id="nc-name" name="name" maxLength={80} />
            </div>
            <div>
              <Label htmlFor="nc-phone">WhatsApp (opcional)</Label>
              <Input id="nc-phone" name="phone" inputMode="tel" maxLength={30} placeholder="987 654 321" />
            </div>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />} Crear cliente</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
