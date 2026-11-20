import { HeadingSkeleton, LoadingState, Skeleton } from '@/components/ui/skeleton';

export default function AdminLoading() {
  return (
    <LoadingState className="space-y-6">
      <HeadingSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-56 rounded-2xl sm:col-span-2 lg:row-span-2" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
    </LoadingState>
  );
}
