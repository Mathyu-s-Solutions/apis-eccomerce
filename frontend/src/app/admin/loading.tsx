import { HeadingSkeleton, LoadingState, Skeleton } from '@/components/ui/skeleton';

export default function AdminLoading() {
  return (
    <LoadingState className="space-y-6">
      <HeadingSkeleton />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
    </LoadingState>
  );
}
