import { cn } from '@/lib/utils';

/** Bloque gris que late mientras carga el contenido real. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-black/[0.07]', className)} />;
}

/** Contenedor de un esqueleto: avisa a los lectores de pantalla que la página está cargando. */
export function LoadingState({ children, className, label = 'Cargando…' }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Encabezado de página: título y bajada. */
export function HeadingSkeleton({ center = false }: { center?: boolean }) {
  return (
    <div className={cn('space-y-3', center && 'flex flex-col items-center')}>
      <Skeleton className="h-9 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <Skeleton className="h-4 w-4/5 max-w-lg" />
    </div>
  );
}

/** Tarjeta con título, un par de líneas y un botón. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-[var(--border)] bg-white p-5', className)}>
      <Skeleton className="h-1.5 w-10 rounded-full" />
      <Skeleton className="mt-4 h-5 w-1/2" />
      <Skeleton className="mt-2 h-3.5 w-3/4" />
      <Skeleton className="mt-6 h-2.5 w-full rounded-full" />
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-9 w-28 rounded-xl" />
        <Skeleton className="h-9 w-20 rounded-xl" />
      </div>
    </div>
  );
}
