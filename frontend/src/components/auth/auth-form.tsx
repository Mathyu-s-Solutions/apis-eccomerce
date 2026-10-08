'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, Input, Label, Alert } from '@/components/ui/primitives';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isRegister = mode === 'register';

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? 'Algo salió mal');
        setLoading(false);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('No se pudo conectar. Inténtalo de nuevo.');
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm p-7">
      <h1 className="text-xl font-semibold">{isRegister ? 'Crea tu cuenta' : 'Ingresa a tu cuenta'}</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {isRegister ? 'Empieza gratis en menos de un minuto.' : 'Bienvenido de vuelta.'}
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {isRegister && (
          <div>
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" placeholder="Tu nombre o empresa" autoComplete="name" />
          </div>
        )}
        <div>
          <Label htmlFor="email">Correo</Label>
          <Input id="email" name="email" type="email" required placeholder="tucorreo@ejemplo.com" autoComplete="email" />
        </div>
        <div>
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={isRegister ? 8 : undefined}
            placeholder={isRegister ? 'Mínimo 8 caracteres' : '••••••••'}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Un momento…' : isRegister ? 'Crear cuenta' : 'Ingresar'}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-[var(--muted)]">
        {isRegister ? (
          <>¿Ya tienes cuenta? <Link href="/login" className="font-medium text-[var(--accent)]">Ingresa</Link></>
        ) : (
          <>¿No tienes cuenta? <Link href="/register" className="font-medium text-[var(--accent)]">Crea una</Link></>
        )}
      </p>
    </Card>
  );
}
