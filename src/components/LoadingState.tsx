import { Database, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-accent mx-auto" />
        <p className="mt-4 text-lg font-medium text-foreground">Loading RF Analytics...</p>
        <p className="mt-1 text-sm text-muted-foreground">Parsing syslog data</p>
      </div>
    </div>
  );
}

interface ErrorStateProps {
  error: string;
}

export function ErrorState({ error }: ErrorStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-4">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Error Loading Data</h2>
        <p className="mt-2 text-muted-foreground">{error}</p>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  title?: string;
  description: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function EmptyState({
  title = 'No Data Available',
  description,
  onRefresh,
  isRefreshing,
}: EmptyStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-4">
        <div className="h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto border border-accent/20">
          <Database className="h-8 w-8 text-accent" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-muted-foreground">{description}</p>

        {onRefresh && (
          <div className="mt-5">
            <Button onClick={onRefresh} variant="outline" disabled={isRefreshing} className="gap-2">
              <RefreshCw className={"h-4 w-4 " + (isRefreshing ? 'animate-spin' : '')} />
              Refresh
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

