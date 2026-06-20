import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, Clock, Radio, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface NetSession {
  id: string;
  name: string;
  started_at: string;
  ended_at: string;
}

interface ReplayControlsProps {
  startISO: string | null;
  endISO: string | null;
  speed: number;
  playing: boolean;
  loading: boolean;
  eventCount: number;
  cursorMs: number | null;
  progress: number;
  onChangeRange: (startISO: string | null, endISO: string | null) => void;
  onChangeSpeed: (speed: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
}

const SPEEDS = [10, 30, 60, 120, 300, 600];

const toLocalInput = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

const fromLocalInput = (val: string): string | null => {
  if (!val) return null;
  // treat input as UTC
  const d = new Date(val + ':00Z');
  return isNaN(d.getTime()) ? null : d.toISOString();
};

export function ReplayControls({
  startISO, endISO, speed, playing, loading, eventCount, cursorMs, progress,
  onChangeRange, onChangeSpeed, onPlay, onPause, onReset,
}: ReplayControlsProps) {
  const [nets, setNets] = useState<NetSession[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('net_sessions')
        .select('id,name,started_at,ended_at')
        .order('started_at', { ascending: false })
        .limit(25);
      if (data) setNets(data as NetSession[]);
    })();
  }, []);

  const applyNet = (id: string) => {
    const n = nets.find(x => x.id === id);
    if (n) onChangeRange(n.started_at, n.ended_at);
  };

  return (
    <div className="border border-border rounded-lg p-3 bg-card/50 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="default" className="bg-purple-500 hover:bg-purple-500 gap-1">
            <Clock className="h-3 w-3" />
            REPLAY MODE
          </Badge>
          {loading && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </span>
          )}
          {!loading && eventCount > 0 && (
            <span className="text-xs text-muted-foreground">{eventCount.toLocaleString()} events</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={playing ? 'outline' : 'default'}
            onClick={playing ? onPause : onPlay}
            disabled={!startISO || !endISO || eventCount === 0}
            className="gap-1.5"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Button size="sm" variant="outline" onClick={onReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Start (UTC)</Label>
          <Input
            type="datetime-local"
            value={toLocalInput(startISO)}
            onChange={e => onChangeRange(fromLocalInput(e.target.value), endISO)}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">End (UTC)</Label>
          <Input
            type="datetime-local"
            value={toLocalInput(endISO)}
            onChange={e => onChangeRange(startISO, fromLocalInput(e.target.value))}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Speed:</span>
        {SPEEDS.map(s => (
          <Button
            key={s}
            size="sm"
            variant={speed === s ? 'default' : 'outline'}
            onClick={() => onChangeSpeed(s)}
            className="h-7 px-2 text-xs"
          >
            {s}×
          </Button>
        ))}
        {nets.length > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <Radio className="h-3.5 w-3.5 text-accent" />
            <select
              onChange={e => { if (e.target.value) applyNet(e.target.value); }}
              defaultValue=""
              className="h-7 text-xs rounded-md border border-border bg-background px-2"
            >
              <option value="">Load Net Session…</option>
              {nets.map(n => (
                <option key={n.id} value={n.id}>
                  {n.name} — {format(new Date(n.started_at), 'MMM d HH:mm')}Z
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-[width] duration-100"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
          <span>{startISO ? format(new Date(startISO), "MMM d HH:mm:ss") + 'Z' : '—'}</span>
          <span className="text-foreground">
            {cursorMs ? format(new Date(cursorMs), "MMM d HH:mm:ss") + 'Z' : '—'}
          </span>
          <span>{endISO ? format(new Date(endISO), "MMM d HH:mm:ss") + 'Z' : '—'}</span>
        </div>
      </div>
    </div>
  );
}
