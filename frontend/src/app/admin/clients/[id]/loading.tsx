import { CardSkeleton, LoadingState, Skeleton } from '@/components/ui/skeleton';

export default function ClientLoading() {
  return (
    <LoadingState className="space-y-8">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
    </LoadingState>
  );
}
