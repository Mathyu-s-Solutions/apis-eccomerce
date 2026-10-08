'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, Input, Label, Select, Badge, Alert } from '@/components/ui/primitives';
import { formatNumber } from '@/lib/utils';

interface ApiKey {
  id: string;
  prefix: string;
  name: string;
  product: string;
  monthlyLimit: number | null;
  enabled: boolean;
  used: number;
}

const PRODUCT_LABEL: Record<string, string> = {
  shalom: 'Shalom', olva: 'Olva', sunat: 'SUNAT', all: 'Todos',
};

export function KeysManager({ defaultProduct }: { defaultProduct: string }) {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [name, setName] = useState('');
  const [product, setProduct] = useState(defaultProduct);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const res = await fetch('/api/keys');
    const data = await res.json();
    setKeys(data.keys ?? []);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, product }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? 'No se pudo crear'); return; }
      setNewKey(data.key);
      setName('');
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    await load();
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-8">
      {newKey && (
        <Card className="border-[var(--accent)]/40 bg-[var(--accent-soft)] p-5">
          <div className="flex items-center gap-2 font-medium"><TriangleAlert size={18} /> Copia tu API key ahora</div>
          <p className="mt-1 text-sm text-[var(--muted)]">Por seguridad no volveremos a mostrarla.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm">{newKey}</code>
            <Button size="sm" onClick={copyKey}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copiado' : 'Copiar'}</Button>
          </div>
          <button onClick={() => setNewKey(null)} className="mt-3 text-sm font-medium text-[var(--accent)]">Entendido, ocultar</button>
        </Card>
      )}

      {/* Crear */}
      <Card className="p-6">
        <h2 className="font-semibold">Crear una API key</h2>
        <form onSubmit={create} className="mt-4 grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <div>
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi tienda" required />
          </div>
          <div>
            <Label htmlFor="product">Producto</Label>
            <Select id="product" value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="shalom">Shalom</option>
              <option value="olva">Olva</option>
              <option value="sunat">SUNAT</option>
              <option value="all">Todos</option>
            </Select>
          </div>
          <Button type="submit" disabled={creating}>
            {creating ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            Crear
          </Button>
        </form>
        {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
      </Card>

      {/* Lista */}
      <div>
        <h2 className="mb-3 font-semibold">Tus API keys</h2>
        {keys === null ? (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
        ) : keys.length === 0 ? (
          <Card className="p-6 text-sm text-[var(--muted)]">Aún no tienes API keys.</Card>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => (
              <Card key={k.id} className={`p-5 ${!k.enabled ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{k.name}</span>
                      <Badge tone="accent">{PRODUCT_LABEL[k.product]}</Badge>
                      {!k.enabled && <Badge tone="danger">Revocada</Badge>}
                    </div>
                    <code className="mt-1 block text-sm text-[var(--muted)]">{k.prefix}••••••••</code>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium">{formatNumber(k.used)} / {formatNumber(k.monthlyLimit)}</p>
                    <p className="text-xs text-[var(--muted)]">consultas este mes</p>
                  </div>
                  {k.enabled && (
                    <button
                      onClick={() => revoke(k.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={15} /> Revocar
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
