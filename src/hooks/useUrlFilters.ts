import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';
import { DateRange, DatePreset, getDefaultDateRange } from '@/components/DateRangeFilter';

const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7days: 'Last 7 Days',
  last30days: 'Last 30 Days',
  lastWeek: 'Last Week',
  lastMonth: 'Last Month',
  lastQuarter: 'Last Quarter',
  lastYear: 'Last Year',
  custom: 'Custom Range',
  all: 'All Dates',
};

interface UrlFilters {
  dateRange: DateRange;
  selectedStation: string | null;
  callsigns: string[] | null;
}

export function useUrlFilters(defaultCallsigns: string[]) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo((): UrlFilters => {
    // Parse date range
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    const presetParam = searchParams.get('preset') as DatePreset | null;
    
    let dateRange: DateRange;
    if (startParam && endParam) {
      const start = new Date(startParam);
      const end = new Date(endParam);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const preset = presetParam || 'custom';
        dateRange = { 
          start, 
          end, 
          preset,
          label: PRESET_LABELS[preset] || 'Custom Range'
        };
      } else {
        dateRange = getDefaultDateRange();
      }
    } else {
      dateRange = getDefaultDateRange();
    }

    // Parse selected station
    const stationParam = searchParams.get('station');
    const selectedStation = stationParam || null;

    // Parse callsigns (comma-separated)
    const callsignsParam = searchParams.get('callsigns');
    const callsigns = callsignsParam 
      ? callsignsParam.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      : null;

    return { dateRange, selectedStation, callsigns };
  }, [searchParams]);

  const setFilters = useCallback((updates: Partial<{
    dateRange: DateRange;
    selectedStation: string | null;
    callsigns: string[];
  }>) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);

      if (updates.dateRange !== undefined) {
        const { start, end, preset } = updates.dateRange;
        newParams.set('start', start.toISOString());
        newParams.set('end', end.toISOString());
        if (preset && preset !== 'custom') {
          newParams.set('preset', preset);
        } else {
          newParams.delete('preset');
        }
      }

      if (updates.selectedStation !== undefined) {
        if (updates.selectedStation) {
          newParams.set('station', updates.selectedStation);
        } else {
          newParams.delete('station');
        }
      }

      if (updates.callsigns !== undefined) {
        const sortedCallsigns = [...updates.callsigns].sort();
        const sortedDefaults = [...defaultCallsigns].sort();
        // Only store in URL if different from defaults
        if (JSON.stringify(sortedCallsigns) !== JSON.stringify(sortedDefaults)) {
          newParams.set('callsigns', updates.callsigns.join(','));
        } else {
          newParams.delete('callsigns');
        }
      }

      return newParams;
    }, { replace: true });
  }, [setSearchParams, defaultCallsigns]);

  const getShareableUrl = useCallback(() => {
    const url = new URL(window.location.href);
    return url.toString();
  }, []);

  const copyShareableUrl = useCallback(async () => {
    const url = getShareableUrl();
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, [getShareableUrl]);

  const hasUrlFilters = useMemo(() => {
    return searchParams.has('start') || searchParams.has('station') || searchParams.has('callsigns');
  }, [searchParams]);

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  return {
    filters,
    setFilters,
    getShareableUrl,
    copyShareableUrl,
    hasUrlFilters,
    clearFilters,
  };
}
