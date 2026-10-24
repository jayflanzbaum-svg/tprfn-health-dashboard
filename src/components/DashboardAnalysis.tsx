import { useState } from 'react';
import { Sparkles, Loader2, Calendar, Send, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { DateRange } from '@/components/DateRangeFilter';
import { toast } from '@/hooks/use-toast';

interface DashboardAnalysisProps {
  dateRange: DateRange;
  allowedCallsigns: string[];
  selectedStation: string | null;
}

function formatPeriod(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const fmt = (d: Date, year: boolean) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' as const } : {}), timeZone: 'UTC' }).format(d);
  return `${fmt(s, !sameYear)} – ${fmt(e, true)}`;
}

export function DashboardAnalysis({ dateRange, allowedCallsigns, selectedStation }: DashboardAnalysisProps) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [periods, setPeriods] = useState<{ current: { start: string; end: string }; previous: { start: string; end: string } } | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [historyScope, setHistoryScope] = useState('history');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<{ start: string | null; end: string | null; targets: string[] } | null>(null);

  const handleQuestion = async () => {
    if (!question.trim() || asking) return;
    setAsking(true); setAnswer(''); setQuestionError(null); setCoverage(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-dashboard`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${session.session?.access_token || key}` },
        body: JSON.stringify({ question: question.trim(), historyScope, dateRange: { start: dateRange.start.toISOString(), end: dateRange.end.toISOString() }, selectedStation, callsigns: allowedCallsigns }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error || `Analysis request failed (${response.status}).`);
      }
      const stream = response.body;
      if (!stream) throw new Error('No answer was received.');
      const reader = stream.getReader(); const decoder = new TextDecoder(); let buffer = ''; let complete = false;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        if (done && buffer) lines.push(buffer);
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'coverage') setCoverage(event.coverage);
          if (event.type === 'text') setAnswer(prev => prev + event.text);
          if (event.type === 'error') throw new Error(event.error);
          if (event.type === 'done') complete = true;
        }
        if (done) break;
      }
      if (!complete) throw new Error('The answer was interrupted. Please start a new question.');
    } catch (err) { setQuestionError(err instanceof Error ? err.message : 'Could not answer this question.'); }
    finally { setAsking(false); }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setOpen(true);
    setAnalysis(null);
    setPeriods(null);

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
        onClick={() => { setOpen(true); if (!analysis && !loading) void handleAnalyze(); }}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-background">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" />Dashboard Analysis</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); void handleQuestion(); }} className="space-y-3 border-b border-border pb-4">
            <label htmlFor="analysis-question" className="flex items-center gap-2 text-sm font-medium"><MessageCircle className="h-4 w-4 text-accent" />Ask a question</label>
            <Textarea id="analysis-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} disabled={asking} placeholder="Has N4SFL’s performance degraded over time? Is it seasonal or cyclical, and how does it compare with nearby stations?" className="min-h-[90px]" />
            <div className="flex flex-wrap justify-between items-center gap-2">
              <Select value={historyScope} onValueChange={setHistoryScope} disabled={asking}>
                <SelectTrigger aria-label="Question date range" className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="history">All recorded history</SelectItem><SelectItem value="selected">Selected date range</SelectItem></SelectContent>
              </Select>
              <Button type="submit" size="sm" disabled={asking || !question.trim()} className="gap-2">{asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{asking ? 'Investigating…' : 'Ask'}</Button>
            </div>
            {questionError && <p role="alert" className="text-sm text-destructive">{questionError}</p>}
            {asking && !answer && <p role="status" className="text-sm text-muted-foreground">Examining recorded station trends and geographic peers…</p>}
            {coverage?.start && coverage.end && <p className="text-xs text-muted-foreground">{coverage.targets.join(', ')} · {formatPeriod(coverage.start, coverage.end)} · UTC</p>}
            {answer && <div aria-live="polite" className="text-sm leading-relaxed"><MarkdownBullets content={answer} /></div>}
          </form>
          <div className="relative pt-1">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-foreground">Dashboard Analysis</h3>
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={handleAnalyze} disabled={loading}>Refresh summary</Button>
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
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MarkdownBullets({ content }: { content: string }) {
  // Simple markdown renderer for bullet points
  const lines = content.split('\n').filter(l => l.trim());
  
  return (
    <ul className="list-none space-y-2 pl-0">
      {lines.map((line, i) => {
        const cleaned = line.trim().replace(/^[-*•]\s+/, '').replace(/^#{1,6}\s+/, '').trim();
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
