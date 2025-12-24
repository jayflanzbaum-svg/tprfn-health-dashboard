import { Skeleton } from '@/components/ui/skeleton';

interface ChartSkeletonProps {
  height?: string;
  title?: string;
}

export function ChartSkeleton({ height = 'h-[300px]', title }: ChartSkeletonProps) {
  return (
    <div className="chart-card">
      {title && (
        <div className="mb-4">
          <Skeleton className="h-5 w-48 mb-2" />
          <Skeleton className="h-3 w-64" />
        </div>
      )}
      <Skeleton className={`w-full ${height} rounded-lg`} />
    </div>
  );
}

export function PieChartSkeleton() {
  return (
    <div className="chart-card h-full">
      <div className="mb-2">
        <Skeleton className="h-5 w-48 mb-1" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="h-[180px] flex items-center justify-center">
        <Skeleton className="h-32 w-32 rounded-full" />
      </div>
    </div>
  );
}

export function LeaderboardSkeleton() {
  return (
    <div className="chart-card h-full flex flex-col">
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded" />
        <div>
          <Skeleton className="h-5 w-48 mb-1" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="flex-1 space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
