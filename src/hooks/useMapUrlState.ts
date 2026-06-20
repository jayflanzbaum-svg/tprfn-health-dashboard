import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

export type ConnectionColorMode = 'snr' | 'bitrate' | 'sessions' | 'live';
export type StationFilter = 'hub' | 'all';
export type MapMode = 'live' | 'replay';

export interface MapUrlState {
  mode: MapMode;
  liveMode: boolean; // kept for backwards compatibility (mirrors mode === 'live')
  stationFilter: StationFilter;
  showConnections: boolean;
  colorMode: ConnectionColorMode;
  replayStart: string | null;
  replayEnd: string | null;
  replaySpeed: number;
}

const DEFAULTS = {
  mode: 'live' as MapMode,
  stationFilter: 'hub' as StationFilter,
  showConnections: true,
  colorMode: 'live' as ConnectionColorMode,
  replaySpeed: 4,
};

export function useMapUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const state = useMemo<MapUrlState>(() => {
    const modeParam = searchParams.get('mode');
    const live = searchParams.get('live');
    const filter = searchParams.get('filter');
    const connections = searchParams.get('connections');
    const color = searchParams.get('color');
    const rStart = searchParams.get('rs');
    const rEnd = searchParams.get('re');
    const rSpeed = searchParams.get('rspd');

    // Resolve mode (prefer new param, fall back to legacy live=)
    let mode: MapMode = DEFAULTS.mode;
    if (modeParam === 'replay' || modeParam === 'live') mode = modeParam;
    else if (live === 'false') mode = 'live'; // legacy false still meant live tab off; map to live

    return {
      mode,
      liveMode: mode === 'live',
      stationFilter: (filter === 'hub' || filter === 'all') ? filter : DEFAULTS.stationFilter,
      showConnections: connections === null ? DEFAULTS.showConnections : connections === 'true',
      colorMode: (['snr', 'bitrate', 'sessions', 'live'].includes(color || '')
        ? color as ConnectionColorMode
        : DEFAULTS.colorMode),
      replayStart: rStart,
      replayEnd: rEnd,
      replaySpeed: rSpeed ? Math.max(1, parseInt(rSpeed, 10) || DEFAULTS.replaySpeed) : DEFAULTS.replaySpeed,
    };
  }, [searchParams]);

  const setState = useCallback((updates: Partial<MapUrlState>) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);

      if (updates.mode !== undefined) {
        if (updates.mode === DEFAULTS.mode) newParams.delete('mode');
        else newParams.set('mode', updates.mode);
      }
      if (updates.liveMode !== undefined && updates.mode === undefined) {
        const next: MapMode = updates.liveMode ? 'live' : 'replay';
        if (next === DEFAULTS.mode) newParams.delete('mode');
        else newParams.set('mode', next);
      }
      if (updates.stationFilter !== undefined) {
        if (updates.stationFilter === DEFAULTS.stationFilter) newParams.delete('filter');
        else newParams.set('filter', updates.stationFilter);
      }
      if (updates.showConnections !== undefined) {
        if (updates.showConnections === DEFAULTS.showConnections) newParams.delete('connections');
        else newParams.set('connections', String(updates.showConnections));
      }
      if (updates.colorMode !== undefined) {
        if (updates.colorMode === DEFAULTS.colorMode) newParams.delete('color');
        else newParams.set('color', updates.colorMode);
      }
      if (updates.replayStart !== undefined) {
        if (!updates.replayStart) newParams.delete('rs');
        else newParams.set('rs', updates.replayStart);
      }
      if (updates.replayEnd !== undefined) {
        if (!updates.replayEnd) newParams.delete('re');
        else newParams.set('re', updates.replayEnd);
      }
      if (updates.replaySpeed !== undefined) {
        if (updates.replaySpeed === DEFAULTS.replaySpeed) newParams.delete('rspd');
        else newParams.set('rspd', String(updates.replaySpeed));
      }

      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  const getShareableUrl = useCallback(() => window.location.href, []);

  const copyShareableUrl = useCallback(async () => {
    const url = getShareableUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Map link copied to clipboard!');
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success('Map link copied to clipboard!');
    }
  }, [getShareableUrl]);

  const hasCustomSettings = useMemo(() => {
    return (
      state.mode !== DEFAULTS.mode ||
      state.stationFilter !== DEFAULTS.stationFilter ||
      state.showConnections !== DEFAULTS.showConnections ||
      state.colorMode !== DEFAULTS.colorMode
    );
  }, [state]);

  return {
    ...state,
    setState,
    getShareableUrl,
    copyShareableUrl,
    hasCustomSettings,
  };
}
