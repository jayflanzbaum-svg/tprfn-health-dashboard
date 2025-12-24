import { Database, Loader2, Radio, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useEffect, useState } from 'react';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message }: LoadingStateProps = {}) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState(message || 'Connecting to database...');

  useEffect(() => {
    // If custom message, don't animate through stages
    if (message) {
      setProgress(50);
      return;
    }
    
    const stages = [
      { progress: 15, text: 'Connecting to database...' },
      { progress: 35, text: 'Fetching syslog entries...' },
      { progress: 55, text: 'Processing records...' },
      { progress: 75, text: 'Building analytics...' },
      { progress: 90, text: 'Preparing visualizations...' },
    ];

    let currentStage = 0;
    const interval = setInterval(() => {
      if (currentStage < stages.length) {
        setProgress(stages[currentStage].progress);
        setStatusText(stages[currentStage].text);
        currentStage++;
      }
    }, 600);

    return () => clearInterval(interval);
  }, [message]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md w-full px-6">
        {/* Animated radio waves */}
        <div className="relative flex items-center justify-center mb-8">
          <div className="absolute h-32 w-32 rounded-full border-2 border-accent/20 animate-ping" style={{ animationDuration: '2s' }} />
          <div className="absolute h-24 w-24 rounded-full border-2 border-accent/30 animate-ping" style={{ animationDuration: '1.5s', animationDelay: '0.2s' }} />
          <div className="absolute h-16 w-16 rounded-full border-2 border-accent/40 animate-ping" style={{ animationDuration: '1s', animationDelay: '0.4s' }} />
          <div className="relative h-20 w-20 rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center">
            <Radio className="h-10 w-10 text-accent animate-pulse" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-2">
          Loading RF Analytics
        </h2>
        <p className="text-muted-foreground mb-6">
          Fetching data from TPRFN network
        </p>

        {/* Progress bar */}
        <div className="space-y-3">
          <Progress value={progress} className="h-2" />
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            <span>{statusText}</span>
          </div>
        </div>

        {/* Pulsing dots */}
        <div className="flex justify-center gap-1.5 mt-6">
          <span className="h-2 w-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="h-2 w-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="h-2 w-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
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

