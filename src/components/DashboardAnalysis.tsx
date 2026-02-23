import { useState } from 'react';
import { Sparkles, X, Loader2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { DateRange } from '@/components/DateRangeFilter';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface DashboardAnalysisProps {
  dateRange: DateRange;
  allowedCallsigns: string[];
  selectedStation: string | null;
}

function formatPeriod(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  const startFmt = sameYear ? format(s, 'MMM d') : format(s, 'MMM d, yyyy');
  return `${startFmt} – ${format(e, 'MMM d, yyyy')}`;
}

export function DashboardAnalysis({ dateRange, allowedCallsigns, selectedStation }: DashboardAnalysisProps) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [periods, setPeriods] = useState<{ current: { start: string; end: string }; previous: { start: string; end: string } } | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    setOpen(true);
    setAnalysis(null);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-dashboard', {
        body: {
          dateRange: {
            start: dateRange.start.toISOString(),
            end: dateRange.end.toISOString(),
          },
          callsigns: allowedCallsigns.map(c => c.toUpperCase().trim()),
          selectedStation: selectedStation ? selectedStation.toUpperCase().trim() : null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAnalysis(data.analysis);
      if (data.currentPeriod && data.previousPeriod) {
        setPeriods({ current: data.currentPeriod, previous: data.previousPeriod });
      }
    } catch (err) {
      console.error('Analysis failed:', err);
      toast({
        title: 'Analysis failed',
        description: err instanceof Error ? err.message : 'Could not generate insights',
        variant: 'destructive',
      });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleAnalyze}
        disabled={loading}
        className="h-7 px-2 gap-1 border-accent/30 hover:bg-accent/10"
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3 text-accent" />
        )}
        <span className="text-xs">{loading ? 'Analyzing...' : 'Analyze'}</span>
      </Button>

      {open && (
        <div className="col-span-full animate-fade-in">
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 relative">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-foreground">AI Dashboard Analysis</h3>
              {selectedStation && (
                <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full font-mono">
                  {selectedStation}
                </span>
              )}
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Comparing current and previous periods...
              </div>
            ) : analysis ? (
              <>
                {periods && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" />
                      <span className="font-medium text-foreground/80">Current:</span>
                      <span>{formatPeriod(periods.current.start, periods.current.end)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground/80">vs Previous:</span>
                      <span>{formatPeriod(periods.previous.start, periods.previous.end)}</span>
                    </div>
                  </div>
                )}
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&_ul]:space-y-1.5 [&_li]:text-foreground/90">
                  <MarkdownBullets content={analysis} />
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

function MarkdownBullets({ content }: { content: string }) {
  // Simple markdown renderer for bullet points
  const lines = content.split('\n').filter(l => l.trim());
  
  return (
    <ul className="list-none space-y-2 pl-0">
      {lines.map((line, i) => {
        const cleaned = line.replace(/^[-*•]\s*/, '').trim();
        if (!cleaned) return null;
        
        // Bold text between ** **
        const parts = cleaned.split(/(\*\*[^*]+\*\*)/g);
        
        return (
          <li key={i} className="flex gap-2 items-start">
            <span className="text-accent mt-0.5 shrink-0">•</span>
            <span>
              {parts.map((part, j) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return <strong key={j} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
                }
                return <span key={j}>{part}</span>;
              })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
