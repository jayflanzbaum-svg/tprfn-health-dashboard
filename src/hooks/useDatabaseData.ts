import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  SNRecord, 
  ConnectRecord, 
  DisconnectRecord, 
  HubConnection, 
  ParsedData,
  normalizeCallsign,
  DEFAULT_ALLOWED_CALLSIGNS
} from '@/lib/syslogParser';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_DAYS = 7;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const AGGREGATION_THRESHOLD_DAYS = 60; // Use server aggregation for ranges > 60 days

// Only fetch the columns we actually need
const SELECTED_COLUMNS = 'id,timestamp,hub,callsign,remote_callsign,event_type,snr,bytes_sent,bytes_received,bitrate,duration_seconds,raw_message';

// The live syslog URL for current data
const LIVE_SYSLOG_URL = 'https://tprfn.k1ajd.net/VARAHF.txt';

interface DatabaseEntry {
  id: string;
  timestamp: string;
  hub: string;
  callsign: string;
  remote_callsign: string | null;
  event_type: string;
  snr: number | null;
  bytes_sent: number | null;
  bytes_received: number | null;
  bitrate: number | null;
  duration_seconds: number | null;
  raw_message?: string | null;
}

interface AggregatedData {
  dailySNAggregates: Array<{
    date: string;
    hour: number;
    avgSN: number;
    count: number;
  }>;
  monthlySNAggregates: Array<{
    year: number;
    month: number;
    week: number;
    avgSN: number;
    count: number;
  }>;
  connectionStats: Array<{
    station1: string;
    station2: string;
    avgSN: number;
    sessionCount: number;
    totalTxBytes: number;
    totalRxBytes: number;
    snCount: number;
  }>;
  totalRecords: number;
  dateRange: {
    start: string;
    end: string;
  };
}

function createConnectionId(station1: string, station2: string): string {
  const sorted = [station1, station2].sort();
  return `${sorted[0]}↔${sorted[1]}`;
}

export function useDatabaseData(allowedCallsigns: string[], fetchDays: number = DEFAULT_DAYS) {
  const [rawData, setRawData] = useState<DatabaseEntry[]>([]);
  const [aggregatedData, setAggregatedData] = useState<AggregatedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [useAggregation, setUseAggregation] = useState(false);

  const allowedSet = useMemo(() => 
    new Set(allowedCallsigns.map(c => c.toUpperCase().trim())), 
    [allowedCallsigns]
  );

  // Fetch fresh data from the live URL and import into database
  const fetchLiveData = useCallback(async () => {
    try {
      console.log('Fetching live syslog data from remote URL...');
      const { data, error } = await supabase.functions.invoke('import-syslog', {
        body: { 
          url: LIVE_SYSLOG_URL, 
          year: new Date().getFullYear(),
          chunkSize: 5000000
        }
      });
      
      if (error) {
        console.warn('Failed to fetch live data:', error.message);
        return false;
      }
      
      console.log('Live data import result:', data);
      return true;
    } catch (err) {
      console.warn('Error fetching live data:', err);
      return false;
    }
  }, []);

  // Fetch aggregated data from server for large date ranges
  const fetchAggregatedData = useCallback(async (startDate: Date, endDate: Date) => {
    console.log(`Using server-side aggregation for ${fetchDays} days`);
    
    const { data, error } = await supabase.functions.invoke('aggregate-syslog', {
      body: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        callsigns: allowedCallsigns
      }
    });

    if (error) {
      throw new Error(error.message);
    }

    console.log(`Received aggregated data: ${data.totalRecords} records, ${data.dailySNAggregates?.length} daily, ${data.connectionStats?.length} connections`);
    return data as AggregatedData;
  }, [allowedCallsigns, fetchDays]);

  // Fetch raw data using pagination for smaller date ranges
  const fetchRawData = useCallback(async (startDate: Date, endDate: Date) => {
    const allEntries: DatabaseEntry[] = [];
    const pageSize = 1000;
    const maxIterations = 300;
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    let cursorTimestamp = startIso;
    let cursorId = '00000000-0000-0000-0000-000000000000';
    let iterations = 0;

    while (iterations < maxIterations) {
      const { data: entries, error: queryError } = await supabase
        .from('syslog_entries')
        .select(SELECTED_COLUMNS)
        .lte('timestamp', endIso)
        .or(`timestamp.gt.${cursorTimestamp},and(timestamp.eq.${cursorTimestamp},id.gt.${cursorId})`)
        .order('timestamp', { ascending: true })
        .order('id', { ascending: true })
        .limit(pageSize);

      if (queryError) {
        throw new Error(queryError.message);
      }

      if (!entries || entries.length === 0) break;

      allEntries.push(...entries);
      
      const lastEntry = entries[entries.length - 1];
      cursorTimestamp = lastEntry.timestamp;
      cursorId = lastEntry.id;
      iterations++;

      if (entries.length < pageSize) break;

      if (iterations % 10 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    return allEntries;
  }, []);

  const fetchData = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      
      console.log('Refreshing from live syslog URL...');
      await fetchLiveData();
      
      console.log('Fetching syslog data from database...');

      const { data: rangeData, error: rangeError } = await supabase
        .from('syslog_entries')
        .select('timestamp')
        .order('timestamp', { ascending: false })
        .limit(1);

      if (rangeError) {
        throw new Error(rangeError.message);
      }

      if (!rangeData || rangeData.length === 0) {
        console.log('No entries found in database');
        setRawData([]);
        setAggregatedData(null);
        setLastUpdated(new Date());
        setError(null);
        return;
      }

      const maxTimestamp = new Date(rangeData[0].timestamp);
      const safeFetchDays = Math.max(1, Math.floor(fetchDays));
      const startDate = new Date(maxTimestamp.getTime() - (safeFetchDays - 1) * MS_PER_DAY);

      console.log(`Database max timestamp: ${maxTimestamp.toISOString()}, fetching from ${startDate.toISOString()} (last ${safeFetchDays} days)`);

      // Use server-side aggregation for large date ranges
      if (safeFetchDays > AGGREGATION_THRESHOLD_DAYS) {
        setUseAggregation(true);
        const aggData = await fetchAggregatedData(startDate, maxTimestamp);
        setAggregatedData(aggData);
        setRawData([]);
      } else {
        setUseAggregation(false);
        const allEntries = await fetchRawData(startDate, maxTimestamp);
        console.log(`Fetched ${allEntries.length} entries from database (last ${safeFetchDays} days)`);
        setRawData(allEntries);
        setAggregatedData(null);
      }

      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching from database:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [fetchLiveData, fetchDays, fetchAggregatedData, fetchRawData]);

  // Initial fetch and set up polling
  useEffect(() => {
    fetchData();

    const interval = window.setInterval(() => {
      console.log('Auto-refreshing database data...');
      fetchData(true);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchData]);

  // Transform database entries to ParsedData format
  const data = useMemo((): ParsedData | null => {
    // Handle aggregated data mode (for large date ranges)
    if (useAggregation && aggregatedData) {
      console.log('Processing aggregated data for visualization');
      
      const snRecords: SNRecord[] = [];
      const connectRecords: ConnectRecord[] = [];
      const disconnectRecords: DisconnectRecord[] = [];
      const stations = new Set<string>();
      const hubConnections = new Map<string, HubConnection>();

      // Create synthetic S/N records from daily aggregates for heatmaps
      for (const agg of aggregatedData.dailySNAggregates) {
        const timestamp = new Date(`${agg.date}T${agg.hour.toString().padStart(2, '0')}:00:00Z`);
        // Create one synthetic record per aggregate to preserve the averages
        snRecords.push({
          timestamp,
          station: 'AGGREGATE',
          partner: 'DATA',
          snValue: agg.avgSN,
          direction: 'outgoing'
        });
      }

      // Create hub connections from connection stats
      for (const stat of aggregatedData.connectionStats) {
        stations.add(stat.station1);
        stations.add(stat.station2);
        
        const connectionId = createConnectionId(stat.station1, stat.station2);
        hubConnections.set(connectionId, {
          station1: stat.station1,
          station2: stat.station2,
          connectionId,
          snRecords: [], // Not needed for aggregated view
          connectRecords: [],
          disconnectRecords: [],
          avgSN: stat.avgSN,
          totalTxBytes: stat.totalTxBytes,
          totalRxBytes: stat.totalRxBytes,
          sessionCount: stat.sessionCount
        });
      }

      const minDate = new Date(aggregatedData.dateRange.start);
      const maxDate = new Date(aggregatedData.dateRange.end);

      return {
        snRecords,
        connectRecords,
        disconnectRecords,
        hubConnections,
        stations,
        dateRange: { start: minDate, end: maxDate },
        // Add aggregation-specific data for charts
        aggregatedData: {
          dailySNAggregates: aggregatedData.dailySNAggregates,
          monthlySNAggregates: aggregatedData.monthlySNAggregates
        }
      };
    }

    // Standard raw data processing
    if (rawData.length === 0) return null;

    const snRecords: SNRecord[] = [];
    const connectRecords: ConnectRecord[] = [];
    const disconnectRecords: DisconnectRecord[] = [];
    const stations = new Set<string>();
    const hubConnections = new Map<string, HubConnection>();

    let minDate = new Date();
    let maxDate = new Date(0);

    const lastPartnerMap = new Map<string, { partner: string; timestamp: Date }>();

    for (const entry of rawData) {
      const timestamp = new Date(entry.timestamp);
      const station = normalizeCallsign(entry.callsign);
      const partner = entry.remote_callsign ? normalizeCallsign(entry.remote_callsign) : '';

      if (!allowedSet.has(station) && !(partner && allowedSet.has(partner))) {
        continue;
      }

      if (timestamp < minDate) minDate = timestamp;
      if (timestamp > maxDate) maxDate = timestamp;

      if (entry.event_type === 'sn_report' && entry.snr !== null && partner) {
        stations.add(station);
        stations.add(partner);

        const record: SNRecord = {
          timestamp,
          station,
          partner,
          snValue: entry.snr,
          direction: 'outgoing'
        };
        snRecords.push(record);

        lastPartnerMap.set(station, { partner, timestamp });

        const connectionId = createConnectionId(station, partner);
        if (!hubConnections.has(connectionId)) {
          hubConnections.set(connectionId, {
            station1: station < partner ? station : partner,
            station2: station < partner ? partner : station,
            connectionId,
            snRecords: [],
            connectRecords: [],
            disconnectRecords: [],
            avgSN: 0,
            totalTxBytes: 0,
            totalRxBytes: 0,
            sessionCount: 0
          });
        }
        hubConnections.get(connectionId)!.snRecords.push(record);
      }

      if ((entry.event_type === 'connect_in' || entry.event_type === 'connect_out') && partner) {
        stations.add(station);
        stations.add(partner);

        const record: ConnectRecord = {
          timestamp,
          station,
          partner,
          varaVersion: 'v4.x'
        };
        connectRecords.push(record);

        lastPartnerMap.set(station, { partner, timestamp });

        const connectionId = createConnectionId(station, partner);
        if (!hubConnections.has(connectionId)) {
          hubConnections.set(connectionId, {
            station1: station < partner ? station : partner,
            station2: station < partner ? partner : station,
            connectionId,
            snRecords: [],
            connectRecords: [],
            disconnectRecords: [],
            avgSN: 0,
            totalTxBytes: 0,
            totalRxBytes: 0,
            sessionCount: 0
          });
        }
        const hub = hubConnections.get(connectionId)!;
        hub.connectRecords.push(record);
        hub.sessionCount++;
      }

      if (entry.event_type === 'disconnect' || entry.event_type === 'disconnect_timeout') {
        const lastPartner = lastPartnerMap.get(station);
        const disconnectPartner = partner || lastPartner?.partner || '';

        if (!disconnectPartner) continue;

        const txBytes = entry.bytes_sent || 0;
        const rxBytes = entry.bytes_received || 0;
        const sessionSeconds = entry.duration_seconds || 0;
        const mins = Math.floor(sessionSeconds / 60);
        const secs = sessionSeconds % 60;

        const record: DisconnectRecord = {
          timestamp,
          station,
          partner: disconnectPartner,
          txBytes,
          rxBytes,
          maxTxBps: entry.bitrate || 0,
          maxRxBps: entry.bitrate || 0,
          sessionTime: `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
          sessionSeconds,
          disconnectType: (entry.raw_message ?? '').toLowerCase().includes('timeout') ? 'timeout' : 'normal'
        };
        disconnectRecords.push(record);

        const connectionId = createConnectionId(station, disconnectPartner);
        if (hubConnections.has(connectionId)) {
          const hub = hubConnections.get(connectionId)!;
          hub.disconnectRecords.push(record);
          hub.totalTxBytes += txBytes;
          hub.totalRxBytes += rxBytes;
        }
      }
    }

    hubConnections.forEach((hub) => {
      if (hub.snRecords.length > 0) {
        hub.avgSN = hub.snRecords.reduce((sum, r) => sum + r.snValue, 0) / hub.snRecords.length;
      }
    });

    return {
      snRecords,
      connectRecords,
      disconnectRecords,
      hubConnections,
      stations,
      dateRange: { start: minDate, end: maxDate }
    };
  }, [rawData, allowedSet, useAggregation, aggregatedData]);

  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return { data, loading, error, refetch, lastUpdated, isRefreshing };
}
