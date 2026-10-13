'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const START = 'mathyu:navigation-start';
const DONE = 'mathyu:navigation-done';

/** Muestra la barra a mano: antes de un router.push/refresh o de una acción larga. */
export function startNavigationProgress() {
  window.dispatchEvent(new Event(START));
}

/** La cierra a mano (p. ej. un router.refresh, que no cambia la URL). */
export function doneNavigationProgress() {
  window.dispatchEvent(new Event(DONE));
}

/** Link interno que lleva a otra URL (no a otra pestaña, no a una descarga, no a un #ancla). */
function isNavigation(e: MouseEvent): boolean {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return false;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

/**
 * Barra fina arriba de la página mientras carga la siguiente. Las páginas se arman en el
 * servidor (sesión, base de datos): sin esto, un clic parecía no hacer nada hasta que llegaba.
 * Arranca al hacer clic en un link interno y termina cuando cambia la URL.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [progress, setProgress] = useState<number | null>(null);
  const timers = useRef<{ show?: number; trickle?: number; hide?: number; safety?: number }>({});
  const active = useRef(false);
  const shown = useRef(false);

  useEffect(() => {
    const t = timers.current;
    const clear = () => {
      window.clearTimeout(t.show);
      window.clearInterval(t.trickle);
      window.clearTimeout(t.hide);
      window.clearTimeout(t.safety);
    };

    const done = () => {
      if (!active.current) return;
      active.current = false;
      clear();
      if (!shown.current) return;
      setProgress(1);
      t.hide = window.setTimeout(() => {
        shown.current = false;
        setProgress(null);
      }, 300);
    };

    const start = () => {
      if (active.current) return;
      active.current = true;
      clear();
      // Si la página llega al toque, no se llega a ver.
      t.show = window.setTimeout(() => {
        shown.current = true;
        setProgress(0.12);
        t.trickle = window.setInterval(() => setProgress((p) => (p === null ? p : p + (0.9 - p) * 0.08)), 250);
      }, 120);
      // Por si la navegación no cambia la URL (p. ej. vuelve a la misma página).
      t.safety = window.setTimeout(done, 20_000);
    };

    const onClick = (e: MouseEvent) => {
      if (isNavigation(e)) start();
    };

    document.addEventListener('click', onClick, true);
    window.addEventListener(START, start);
    window.addEventListener(DONE, done);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(START, start);
      window.removeEventListener(DONE, done);
      clear();
    };
  }, []);

  // Llegó la página nueva.
  useEffect(() => {
    doneNavigationProgress();
  }, [pathname, search]);

  if (progress === null) return null;
  // Color insignia: el primario de Olva es casi negro y no se vería sobre la franja oscura.
  return (
    <div
      role="progressbar"
      aria-label="Cargando la página"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
    >
      <div
        className="h-full origin-left bg-[var(--signature)] shadow-[0_0_10px_var(--signature)] transition-[transform,opacity] duration-300 ease-out"
        style={{ transform: `scaleX(${progress})`, opacity: progress >= 1 ? 0 : 1 }}
      />
    </div>
  );
}
