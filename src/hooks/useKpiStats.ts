import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DateRange, getComparisonPeriod } from '@/components/DateRangeFilter';

export interface KpiData {
  avgSn: number;
  snReadings: number;
  sessions: number;
  totalData: number;
  successRate: number;
}

export interface KpiComparison {
  current: KpiData;
  previous: KpiData;
  changes: {
    avgSn: number;
    snReadings: number;
    sessions: number;
    totalData: number;
  };
  label: string;
}

interface UseKpiStatsResult {
  kpiComparison: KpiComparison | null;
  loading: boolean;
  error: string | null;
}

async function fetchKpis(
  startTs: Date,
  endTs: Date,
  callsigns: string[],
  selectedStation: string | null
): Promise<KpiData> {
  const { data, error } = await supabase.rpc('syslog_kpis', {
    start_ts: startTs.toISOString(),
    end_ts: endTs.toISOString(),
    allowed_callsigns: callsigns.map(c => c.toUpperCase().trim()),
    selected_station: selectedStation ? selectedStation.toUpperCase().trim() : null,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0] ?? { avg_sn: 0, sn_readings: 0, sessions: 0, total_data: 0, success_rate: 0 };
  return {
    avgSn: Number(row.avg_sn) || 0,
    snReadings: Number(row.sn_readings) || 0,
    sessions: Number(row.sessions) || 0,
    totalData: Number(row.total_data) || 0,
    successRate: Number(row.success_rate) || 0,
  };
}

function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function useKpiStats(
  dateRange: DateRange,
  allowedCallsigns: string[],
  selectedStation: string | null
): UseKpiStatsResult {
  const [kpiComparison, setKpiComparison] = useState<KpiComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoize comparison period
  const comparison = useMemo(() => {
    if (dateRange.preset === 'all') return null;
    return getComparisonPeriod(dateRange);
  }, [dateRange]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Clamp current end to "now" so we compare same elapsed time
        const now = new Date();
        const currentEnd = now < dateRange.end ? now : dateRange.end;

        const currentKpi = await fetchKpis(dateRange.start, currentEnd, allowedCallsigns, selectedStation);

        if (cancelled) return;

        if (!comparison) {
          // No comparison for "all" preset
          setKpiComparison({
            current: currentKpi,
            previous: { avgSn: 0, snReadings: 0, sessions: 0, totalData: 0, successRate: 0 },
            changes: { avgSn: 0, snReadings: 0, sessions: 0, totalData: 0 },
            label: '',
          });
        } else {
          const previousKpi = await fetchKpis(comparison.start, comparison.end, allowedCallsigns, selectedStation);

          if (cancelled) return;

          setKpiComparison({
            current: currentKpi,
            previous: previousKpi,
            changes: {
              avgSn: calcChange(currentKpi.avgSn, previousKpi.avgSn),
              snReadings: calcChange(currentKpi.snReadings, previousKpi.snReadings),
              sessions: calcChange(currentKpi.sessions, previousKpi.sessions),
              totalData: calcChange(currentKpi.totalData, previousKpi.totalData),
            },
            label: comparison.label,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [dateRange, allowedCallsigns, selectedStation, comparison]);

  return { kpiComparison, loading, error };
}
