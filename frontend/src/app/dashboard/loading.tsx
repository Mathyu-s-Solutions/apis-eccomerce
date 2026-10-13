import { CardSkeleton, HeadingSkeleton, LoadingState, Skeleton } from '@/components/ui/skeleton';

// Entre secciones del panel: el header y el menú quedan y el contenido carga aquí.
export default function DashboardLoading() {
  return (
    <LoadingState className="space-y-8">
      <HeadingSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
    </LoadingState>
  );
}
