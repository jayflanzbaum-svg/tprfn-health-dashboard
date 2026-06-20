import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ReplayEvent {
  id: string;
  timestamp: Date;
  station1: string; // hub-side normalized
  station2: string; // remote normalized
  eventType: string;
  snr: number | null;
  bitrate: number | null;
  hub: string;
}

interface UseReplayPlayerOptions {
  start: Date | null;
  end: Date | null;
  speed: number; // playback multiplier (e.g. 60 = 1 minute of log per real second)
  onEvent: (event: ReplayEvent) => void;
}

const normalize = (cs: string | null | undefined): string =>
  (cs || '').replace(/-[0-9A-Z]+$/i, '').toUpperCase().trim();

export function useReplayPlayer({ start, end, speed, onEvent }: UseReplayPlayerOptions) {
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cursorMs, setCursorMs] = useState<number | null>(null); // current replay timestamp
  const [progress, setProgress] = useState(0); // 0..1

  const cursorIndexRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Load events whenever date range changes
  useEffect(() => {
    if (!start || !end) {
      setEvents([]);
      setCursorMs(null);
      cursorIndexRef.current = 0;
      setProgress(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: qErr } = await supabase
          .from('syslog_entries')
          .select('id, timestamp, hub, callsign, remote_callsign, event_type, snr, bitrate')
          .gte('timestamp', start.toISOString())
          .lte('timestamp', end.toISOString())
          .in('event_type', ['connect_in', 'connect_out', 'sn_report'])
          .not('remote_callsign', 'is', null)
          .order('timestamp', { ascending: true })
          .limit(20000);
        if (qErr) throw qErr;
        if (cancelled) return;
        const parsed: ReplayEvent[] = (data || [])
          .map((r: any) => {
            const s1 = normalize(r.callsign);
            const s2 = normalize(r.remote_callsign);
            if (!s1 || !s2) return null;
            return {
              id: r.id,
              timestamp: new Date(r.timestamp),
              station1: s1,
              station2: s2,
              eventType: r.event_type,
              snr: r.snr !== null && r.snr !== undefined ? Number(r.snr) : null,
              bitrate: r.bitrate !== null && r.bitrate !== undefined ? Number(r.bitrate) : null,
              hub: r.hub,
            } as ReplayEvent;
          })
          .filter(Boolean) as ReplayEvent[];
        setEvents(parsed);
        cursorIndexRef.current = 0;
        setCursorMs(start.getTime());
        setProgress(0);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load replay events');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [start?.getTime(), end?.getTime()]);

  // Playback loop
  useEffect(() => {
    if (!playing || !start || !end || events.length === 0) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTickRef.current = null;
      return;
    }
    const startMs = start.getTime();
    const endMs = end.getTime();

    const tick = (now: number) => {
      if (lastTickRef.current === null) lastTickRef.current = now;
      const dtReal = now - lastTickRef.current;
      lastTickRef.current = now;

      setCursorMs(prev => {
        const base = prev ?? startMs;
        const next = Math.min(endMs, base + dtReal * speed);

        // Emit events whose timestamps fall in (base, next]
        while (
          cursorIndexRef.current < events.length &&
          events[cursorIndexRef.current].timestamp.getTime() <= next
        ) {
          const ev = events[cursorIndexRef.current];
          if (ev.timestamp.getTime() >= startMs) onEventRef.current(ev);
          cursorIndexRef.current++;
        }

        setProgress((next - startMs) / Math.max(1, endMs - startMs));

        if (next >= endMs) {
          setPlaying(false);
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTickRef.current = null;
    };
  }, [playing, speed, events, start?.getTime(), end?.getTime()]);

  const play = useCallback(() => {
    if (!start || !end || events.length === 0) return;
    // If at end, restart
    if (cursorMs !== null && end && cursorMs >= end.getTime()) {
      cursorIndexRef.current = 0;
      setCursorMs(start.getTime());
      setProgress(0);
    }
    setPlaying(true);
  }, [start, end, events.length, cursorMs]);

  const pause = useCallback(() => setPlaying(false), []);

  const reset = useCallback(() => {
    setPlaying(false);
    cursorIndexRef.current = 0;
    setCursorMs(start ? start.getTime() : null);
    setProgress(0);
  }, [start]);

  return {
    events,
    loading,
    error,
    playing,
    cursorMs,
    progress,
    play,
    pause,
    reset,
  };
}
