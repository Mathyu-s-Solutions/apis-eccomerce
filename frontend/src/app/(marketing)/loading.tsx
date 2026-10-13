import { CardSkeleton, HeadingSkeleton, LoadingState } from '@/components/ui/skeleton';

// Se ve al instante al navegar entre páginas públicas; el header y el footer no se mueven.
export default function MarketingLoading() {
  return (
    <LoadingState className="mx-auto max-w-6xl px-4 py-14">
      <HeadingSkeleton center />
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </LoadingState>
  );
}
