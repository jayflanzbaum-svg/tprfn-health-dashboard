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
  /** Playback speed multiplier. Base hold per event = 6s. */
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
        const DEDUP_WINDOW_MS = 5 * 60 * 1000; // collapse both sides/retries of the same connection
        const rawEvents: ReplayEvent[] = (data || [])
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

        // Build per-pair list of S/N readings so we can backfill connect events
        // that don't carry an snr value themselves.
        const snrByPair = new Map<string, { t: number; snr: number }[]>();
        for (const ev of rawEvents) {
          if (ev.eventType !== 'sn_report' || ev.snr === null || isNaN(ev.snr)) continue;
          const k = [ev.station1, ev.station2].sort().join('<>');
          const arr = snrByPair.get(k) || [];
          arr.push({ t: ev.timestamp.getTime(), snr: ev.snr });
          snrByPair.set(k, arr);
        }
        const nearestSnr = (pairKey: string, ts: number): number | null => {
          const arr = snrByPair.get(pairKey);
          if (!arr || arr.length === 0) return null;
          let best = arr[0];
          let bestDiff = Math.abs(arr[0].t - ts);
          for (let i = 1; i < arr.length; i++) {
            const d = Math.abs(arr[i].t - ts);
            if (d < bestDiff) { bestDiff = d; best = arr[i]; }
          }
          // Only use if within 10 minutes of the event
          return bestDiff <= 10 * 60 * 1000 ? best.snr : null;
        };

        // Deduplicate replay callouts: S/N rows are used only to backfill signal
        // values, while connect rows drive what gets displayed. This prevents a
        // connect followed by its S/N report from looking like two connections.
        const lastSeen = new Map<string, number>();
        const parsed = rawEvents.filter((ev) => ev.eventType === 'connect_in' || ev.eventType === 'connect_out').filter((ev) => {
          const pairKey = [ev.station1, ev.station2].sort().join('<>')
          const ts = ev.timestamp.getTime();
          const prev = lastSeen.get(pairKey);
          if (prev !== undefined && ts - prev < DEDUP_WINDOW_MS) {
            return false;
          }
          lastSeen.set(pairKey, ts);
          return true;
        }).map((ev) => {
          if (ev.snr !== null && !isNaN(ev.snr)) return ev;
          const pairKey = [ev.station1, ev.station2].sort().join('<>');
          return { ...ev, snr: nearestSnr(pairKey, ev.timestamp.getTime()) };
        });

        setEvents(parsed);

      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load replay events');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [start?.getTime(), end?.getTime()]);

  // Compute hold duration based on speed multiplier (base = 4 seconds per event)
  const holdDurationMs = Math.max(1200, Math.round(4000 / Math.max(0.1, eventsPerSecond)));

  // Sequential playback — emit one event, wait, then emit the next
  const scheduleNext = useCallback(() => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    const i = indexRef.current;
    if (i >= events.length) {
      setPlaying(false);
      setDone(true);
      return;
    }
    onEventRef.current(events[i]);
    indexRef.current = i + 1;
    setEmittedCount(i + 1);
    timerRef.current = window.setTimeout(scheduleNext, holdDurationMs);
  }, [events, holdDurationMs]);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
      if (tickerRef.current) { window.clearInterval(tickerRef.current); tickerRef.current = null; }
      if (playStartRef.current !== null) {
        baseElapsedRef.current += performance.now() - playStartRef.current;
        playStartRef.current = null;
      }
      return;
    }
    if (events.length === 0) return;

    playStartRef.current = performance.now();

    // Kick off the sequential chain
    scheduleNext();

    // Elapsed timer ticker
    tickerRef.current = window.setInterval(() => {
      const live = playStartRef.current !== null ? performance.now() - playStartRef.current : 0;
      setElapsedMs(baseElapsedRef.current + live);
    }, 100);

    return () => {
      if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
      if (tickerRef.current) { window.clearInterval(tickerRef.current); tickerRef.current = null; }
      if (playStartRef.current !== null) {
        baseElapsedRef.current += performance.now() - playStartRef.current;
        playStartRef.current = null;
      }
    };
  }, [playing, events, scheduleNext]);

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
