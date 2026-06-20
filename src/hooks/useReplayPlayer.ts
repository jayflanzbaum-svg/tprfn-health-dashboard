import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ReplayEvent {
  id: string;
  timestamp: Date;
  station1: string;
  station2: string;
  eventType: string;
  snr: number | null;
  bitrate: number | null;
  hub: string;
}

interface UseReplayPlayerOptions {
  start: Date | null;
  end: Date | null;
  /** Playback speed in events per second. */
  eventsPerSecond: number;
  onEvent: (event: ReplayEvent) => void;
}

const normalize = (cs: string | null | undefined): string =>
  (cs || '').replace(/-[0-9A-Z]+$/i, '').toUpperCase().trim();

export function useReplayPlayer({ start, end, eventsPerSecond, onEvent }: UseReplayPlayerOptions) {
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const [emittedCount, setEmittedCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const indexRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const tickerRef = useRef<number | null>(null);
  const playStartRef = useRef<number | null>(null);
  const baseElapsedRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Load events whenever date range changes
  useEffect(() => {
    if (!start || !end) {
      setEvents([]);
      setEmittedCount(0);
      setElapsedMs(0);
      setDone(false);
      indexRef.current = 0;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDone(false);
    setEmittedCount(0);
    setElapsedMs(0);
    indexRef.current = 0;
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
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load replay events');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [start?.getTime(), end?.getTime()]);

  // Playback loop — emit events successively at fixed interval
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
      if (tickerRef.current) { window.clearInterval(tickerRef.current); tickerRef.current = null; }
      if (playStartRef.current !== null) {
        baseElapsedRef.current += performance.now() - playStartRef.current;
        playStartRef.current = null;
      }
      return;
    }
    if (events.length === 0) return;

    playStartRef.current = performance.now();
    const intervalMs = Math.max(30, Math.round(1000 / Math.max(0.1, eventsPerSecond)));

    timerRef.current = window.setInterval(() => {
      const i = indexRef.current;
      if (i >= events.length) {
        if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
        setPlaying(false);
        setDone(true);
        return;
      }
      onEventRef.current(events[i]);
      indexRef.current = i + 1;
      setEmittedCount(i + 1);
    }, intervalMs);

    // Elapsed timer ticker (10 fps is plenty for mm:ss)
    tickerRef.current = window.setInterval(() => {
      const live = playStartRef.current !== null ? performance.now() - playStartRef.current : 0;
      setElapsedMs(baseElapsedRef.current + live);
    }, 100);

    return () => {
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
      if (tickerRef.current) { window.clearInterval(tickerRef.current); tickerRef.current = null; }
      if (playStartRef.current !== null) {
        baseElapsedRef.current += performance.now() - playStartRef.current;
        playStartRef.current = null;
      }
    };
  }, [playing, events, eventsPerSecond]);

  const play = useCallback(() => {
    if (events.length === 0) return;
    if (done || indexRef.current >= events.length) {
      indexRef.current = 0;
      baseElapsedRef.current = 0;
      setEmittedCount(0);
      setElapsedMs(0);
      setDone(false);
    }
    setPlaying(true);
  }, [events.length, done]);

  const pause = useCallback(() => setPlaying(false), []);

  const reset = useCallback(() => {
    setPlaying(false);
    setDone(false);
    indexRef.current = 0;
    baseElapsedRef.current = 0;
    setEmittedCount(0);
    setElapsedMs(0);
  }, []);

  const total = events.length;
  const progress = total > 0 ? emittedCount / total : 0;

  return {
    events,
    loading,
    error,
    playing,
    done,
    emittedCount,
    elapsedMs,
    progress,
    play,
    pause,
    reset,
  };
}
