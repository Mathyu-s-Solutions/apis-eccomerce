import { LoadingState, Skeleton } from '@/components/ui/skeleton';

export default function AuthLoading() {
  return (
    <LoadingState className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-7">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="mt-2 h-4 w-2/3" />
      <Skeleton className="mt-6 h-11 w-full rounded-xl" />
      <Skeleton className="mt-8 h-11 w-full rounded-xl" />
      <Skeleton className="mt-4 h-11 w-full rounded-xl" />
      <Skeleton className="mt-6 h-11 w-full rounded-xl" />
    </LoadingState>
  );
}
