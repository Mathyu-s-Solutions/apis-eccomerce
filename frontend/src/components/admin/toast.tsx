'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'error';
interface Toast { id: number; tone: Tone; text: string }

const ToastContext = createContext<(tone: Tone, text: string) => void>(() => {});

/** Avisos cortos abajo a la derecha tras cada acción del admin. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((tone: Tone, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg',
              t.tone === 'error' ? 'border-red-200' : 'border-[var(--border)]',
            )}
          >
            {t.tone === 'error'
              ? <CircleAlert size={18} className="mt-px shrink-0 text-red-600" />
              : <CheckCircle2 size={18} className="mt-px shrink-0 text-green-600" />}
            <span className="flex-1">{t.text}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Cerrar aviso" className="text-[var(--muted)] hover:text-[var(--foreground)]">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/**
 * Llama a una ruta de /api/admin: avisa el resultado (el `message` de la respuesta
 * o el texto de éxito) y refresca la página del servidor. Devuelve el cuerpo o null.
 */
export function useAdminAction() {
  const toast = useToast();
  const router = useRouter();
  return useCallback(
    async <T extends Record<string, unknown>>(url: string, init: { method?: string; json?: unknown; body?: FormData }, success?: string): Promise<T | null> => {
      try {
        const res = await fetch(url, {
          method: init.method ?? 'POST',
          ...(init.body ? { body: init.body } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.json ?? {}) }),
        });
        const data = (await res.json().catch(() => ({}))) as T & { message?: string };
        if (!res.ok) {
          toast('error', data.message ?? 'No se pudo completar la acción');
          return null;
        }
        const text = success ?? data.message;
        if (text) toast('success', text);
        router.refresh();
        return data;
      } catch {
        toast('error', 'Sin conexión: inténtalo de nuevo');
        return null;
      }
    },
    [router, toast],
  );
}
