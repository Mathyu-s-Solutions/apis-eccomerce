'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FirebaseError } from 'firebase/app';
import {
  type User,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, Input, Label, Alert } from '@/components/ui/primitives';
import { firebaseAuth } from '@/lib/firebase';

type Pending = 'google' | 'email' | 'reset' | 'resend';

class SessionError extends Error {}

/** Mensaje para el usuario; null si no hay nada que mostrar (p. ej. cerró el popup). */
function messageFor(err: unknown): string | null {
  if (err instanceof SessionError) return err.message;
  const code = err instanceof FirebaseError ? err.code : '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null;
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos';
    case 'auth/email-already-in-use':
      return 'Ya existe una cuenta con ese correo. Ingresa o recupera tu contraseña.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'La contraseña es muy débil. Usa al menos 8 caracteres.';
    case 'auth/invalid-email':
      return 'Correo inválido';
    case 'auth/user-disabled':
      return 'Esta cuenta está deshabilitada.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
    case 'auth/popup-blocked':
      return 'Tu navegador bloqueó la ventana de Google. Permite ventanas emergentes e inténtalo de nuevo.';
    case 'auth/network-request-failed':
      return 'No se pudo conectar. Inténtalo de nuevo.';
    default:
      return 'Algo salió mal. Inténtalo de nuevo.';
  }
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [unverified, setUnverified] = useState<User | null>(null);
  const isRegister = mode === 'register';

  // Adónde vuelve el usuario desde los enlaces de los correos de Firebase.
  const actionSettings = () => ({ url: `${window.location.origin}/login` });

  function begin(what: Pending) {
    setError(null);
    setNotice(null);
    setPending(what);
  }

  function fail(err: unknown) {
    setError(messageFor(err));
    setPending(null);
  }

  /** Cambia el ID token de Firebase por nuestra cookie de sesión. */
  async function startSession(user: User) {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    await signOut(firebaseAuth());
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new SessionError(data.message ?? 'Algo salió mal');
    router.push('/dashboard');
    router.refresh();
  }

  async function onGoogle() {
    begin('google');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const { user } = await signInWithPopup(firebaseAuth(), provider);
      await startSession(user);
    } catch (err) {
      fail(err);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    begin('email');
    setUnverified(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const name = String(form.get('name') ?? '').trim() || undefined;
    const auth = firebaseAuth();
    try {
      if (isRegister) {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(user, { displayName: name });
        await sendEmailVerification(user, actionSettings());
        await signOut(auth);
        setNotice(`Te enviamos un enlace de confirmación a ${email}. Ábrelo y luego ingresa.`);
        setPending(null);
        return;
      }
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      if (!user.emailVerified) {
        setUnverified(user);
        setError('Aún no confirmas tu correo. Revisa tu bandeja de entrada (y spam).');
        setPending(null);
        return;
      }
      await startSession(user);
    } catch (err) {
      fail(err);
    }
  }

  async function onResend() {
    if (!unverified) return;
    begin('resend');
    try {
      await sendEmailVerification(unverified, actionSettings());
      setUnverified(null);
      setNotice('Listo, te reenviamos el correo de confirmación.');
      setPending(null);
    } catch (err) {
      fail(err);
    }
  }

  async function onForgot() {
    const email = emailRef.current?.value.trim();
    if (!email) {
      setNotice(null);
      setError('Escribe tu correo arriba y te enviamos el enlace.');
      return;
    }
    begin('reset');
    try {
      await sendPasswordResetEmail(firebaseAuth(), email, actionSettings());
      setNotice(`Si ${email} tiene cuenta, te llegará un enlace para crear una nueva contraseña.`);
      setPending(null);
    } catch (err) {
      fail(err);
    }
  }

  return (
    <Card className="w-full max-w-sm p-7">
      <h1 className="text-xl font-semibold">{isRegister ? 'Crea tu cuenta' : 'Ingresa a tu cuenta'}</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {isRegister ? 'Empieza gratis en menos de un minuto.' : 'Bienvenido de vuelta.'}
      </p>

      <Button type="button" variant="outline" className="mt-6 w-full" disabled={pending !== null} onClick={onGoogle}>
        <GoogleIcon />
        {pending === 'google' ? 'Un momento…' : 'Continuar con Google'}
      </Button>

      <div className="my-5 flex items-center gap-3 text-xs text-[var(--muted)]">
        <span className="h-px flex-1 bg-[var(--border)]" />
        o con tu correo
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {isRegister && (
          <div>
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" placeholder="Tu nombre o empresa" autoComplete="name" />
          </div>
        )}
        <div>
          <Label htmlFor="email">Correo</Label>
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            required
            placeholder="tucorreo@ejemplo.com"
            autoComplete="email"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Contraseña</Label>
            {!isRegister && (
              <button
                type="button"
                onClick={onForgot}
                disabled={pending !== null}
                className="text-xs font-medium text-[var(--accent)] disabled:opacity-50"
              >
                {pending === 'reset' ? 'Enviando…' : '¿La olvidaste?'}
              </button>
            )}
          </div>
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

        {error && (
          <Alert tone="error">
            {error}
            {unverified && (
              <button
                type="button"
                onClick={onResend}
                disabled={pending !== null}
                className="mt-1 block font-medium underline disabled:opacity-50"
              >
                {pending === 'resend' ? 'Reenviando…' : 'Reenviar correo de confirmación'}
              </button>
            )}
          </Alert>
        )}
        {notice && <Alert tone="success">{notice}</Alert>}

        <Button type="submit" className="w-full" disabled={pending !== null}>
          {pending === 'email' ? 'Un momento…' : isRegister ? 'Crear cuenta' : 'Ingresar'}
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
