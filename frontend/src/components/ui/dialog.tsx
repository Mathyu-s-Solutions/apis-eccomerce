'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Modal con <dialog> nativo: atrapa el foco, cierra con Esc y con un clic fuera,
 * y devuelve el foco a quien lo abrió. Se monta siempre; `open` lo muestra.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal enfoca el primer botón (cerrar): mejor el primer campo del formulario, si hay.
      dialog.querySelector<HTMLElement>('input:not([type=hidden]):not([type=file]):not([disabled]), select, textarea')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Clic en el fondo (fuera del contenido): el target es el propio <dialog>.
      onMouseDown={(e) => { if (e.target === ref.current) onClose(); }}
      className={cn(
        'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px]',
        className,
      )}
    >
      {/* El scroll va aquí y no en el <dialog>: así arrastrar la barra no cuenta como clic en el fondo. */}
      {open && (
        <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
