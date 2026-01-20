import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

export type ConnectionColorMode = 'snr' | 'bitrate' | 'sessions' | 'live';
export type StationFilter = 'hub' | 'all';

export interface MapUrlState {
  liveMode: boolean;
  stationFilter: StationFilter;
  showConnections: boolean;
  colorMode: ConnectionColorMode;
}

const DEFAULTS: MapUrlState = {
  liveMode: true,
  stationFilter: 'hub',
  showConnections: true,
  colorMode: 'live',
};

export function useMapUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse state from URL
  const state = useMemo<MapUrlState>(() => {
    const live = searchParams.get('live');
    const filter = searchParams.get('filter');
    const connections = searchParams.get('connections');
    const color = searchParams.get('color');

    return {
      liveMode: live === null ? DEFAULTS.liveMode : live === 'true',
      stationFilter: (filter === 'hub' || filter === 'all') ? filter : DEFAULTS.stationFilter,
      showConnections: connections === null ? DEFAULTS.showConnections : connections === 'true',
      colorMode: (['snr', 'bitrate', 'sessions', 'live'].includes(color || '') 
        ? color as ConnectionColorMode 
        : DEFAULTS.colorMode),
    };
  }, [searchParams]);

  // Update URL with new state
  const setState = useCallback((updates: Partial<MapUrlState>) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      
      if (updates.liveMode !== undefined) {
        if (updates.liveMode === DEFAULTS.liveMode) {
          newParams.delete('live');
        } else {
          newParams.set('live', String(updates.liveMode));
        }
      }
      
      if (updates.stationFilter !== undefined) {
        if (updates.stationFilter === DEFAULTS.stationFilter) {
          newParams.delete('filter');
        } else {
          newParams.set('filter', updates.stationFilter);
        }
      }
      
      if (updates.showConnections !== undefined) {
        if (updates.showConnections === DEFAULTS.showConnections) {
          newParams.delete('connections');
        } else {
          newParams.set('connections', String(updates.showConnections));
        }
      }
      
      if (updates.colorMode !== undefined) {
        if (updates.colorMode === DEFAULTS.colorMode) {
          newParams.delete('color');
        } else {
          newParams.set('color', updates.colorMode);
        }
      }
      
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  // Generate shareable URL
  const getShareableUrl = useCallback(() => {
    return window.location.href;
  }, []);

  // Copy URL to clipboard
  const copyShareableUrl = useCallback(async () => {
    const url = getShareableUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Map link copied to clipboard!');
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success('Map link copied to clipboard!');
    }
  }, [getShareableUrl]);

  // Check if any non-default options are set
  const hasCustomSettings = useMemo(() => {
    return (
      state.liveMode !== DEFAULTS.liveMode ||
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
