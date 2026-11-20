import { HeadingSkeleton, LoadingState, Skeleton } from '@/components/ui/skeleton';

export default function ClientsLoading() {
  return (
    <LoadingState className="space-y-6">
      <HeadingSkeleton />
      <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    </LoadingState>
  );
}
