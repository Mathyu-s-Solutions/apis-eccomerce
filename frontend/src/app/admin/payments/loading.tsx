import { HeadingSkeleton, LoadingState, Skeleton } from '@/components/ui/skeleton';

export default function PaymentsLoading() {
  return (
    <LoadingState className="space-y-6">
      <HeadingSkeleton />
      <Skeleton className="h-11 w-full max-w-lg rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
      </div>
    </LoadingState>
  );
}
