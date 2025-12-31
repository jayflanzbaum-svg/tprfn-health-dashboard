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
const DEFAULT_DAYS = 7; // Fetch only 7 days by default for performance
const MS_PER_DAY = 1000 * 60 * 60 * 24;

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

function createConnectionId(station1: string, station2: string): string {
  const sorted = [station1, station2].sort();
  return `${sorted[0]}↔${sorted[1]}`;
}

export function useDatabaseData(allowedCallsigns: string[], fetchDays: number = DEFAULT_DAYS) {
  const [rawData, setRawData] = useState<DatabaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
          chunkSize: 5000000 // 5MB - reasonable for live data
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

  const fetchData = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      
      // First, try to fetch fresh data from the live URL
      console.log('Refreshing from live syslog URL...');
      await fetchLiveData();
      
      console.log('Fetching syslog data from database...');

      // First, get the max timestamp in the database so we fetch relative to actual data
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
        setLastUpdated(new Date());
        setError(null);
        return;
      }

      const maxTimestamp = new Date(rangeData[0].timestamp);
      const safeFetchDays = Math.max(1, Math.floor(fetchDays));
      const startDate = new Date(maxTimestamp.getTime() - (safeFetchDays - 1) * MS_PER_DAY);

      console.log(`Database max timestamp: ${maxTimestamp.toISOString()}, fetching from ${startDate.toISOString()} (last ${safeFetchDays} days)`);

      const allEntries: DatabaseEntry[] = [];
      const pageSize = 1000;
      const maxIterations = 600; // Safety limit for very large date ranges
      const startIso = startDate.toISOString();
      const endIso = maxTimestamp.toISOString();

      // Keyset pagination with composite cursor (timestamp, id) - much faster than offset for large datasets
      let cursorTimestamp = startIso;
      let cursorId = '00000000-0000-0000-0000-000000000000'; // Start before any real UUID
      let iterations = 0;

      while (iterations < maxIterations) {
        // Use composite keyset: (timestamp, id) > (cursorTimestamp, cursorId)
        // This is done by: timestamp > cursorTimestamp OR (timestamp = cursorTimestamp AND id > cursorId)
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
        
        // Update cursor to last entry
        const lastEntry = entries[entries.length - 1];
        cursorTimestamp = lastEntry.timestamp;
        cursorId = lastEntry.id;
        iterations++;

        if (entries.length < pageSize) break;

        // Yield to the browser every 10 pages to keep UI responsive
        if (iterations % 10 === 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }

      console.log(`Fetched ${allEntries.length} entries from database (last ${Math.max(1, Math.floor(fetchDays))} days)`);
      setRawData(allEntries);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching from database:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [fetchLiveData, fetchDays]);

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
    if (rawData.length === 0) return null;

    const snRecords: SNRecord[] = [];
    const connectRecords: ConnectRecord[] = [];
    const disconnectRecords: DisconnectRecord[] = [];
    const stations = new Set<string>();
    const hubConnections = new Map<string, HubConnection>();

    let minDate = new Date();
    let maxDate = new Date(0);

    // Track the last partner for each station for disconnect events
    const lastPartnerMap = new Map<string, { partner: string; timestamp: Date }>();

    for (const entry of rawData) {
      const timestamp = new Date(entry.timestamp);
      const station = normalizeCallsign(entry.callsign);
      const partner = entry.remote_callsign ? normalizeCallsign(entry.remote_callsign) : '';

      // Filter by allowed callsigns
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

        // Track for disconnect matching
        lastPartnerMap.set(station, { partner, timestamp });

        // Add to hub connection
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
          varaVersion: 'v4.x' // Version not stored in DB
        };
        connectRecords.push(record);

        // Track for disconnect matching
        lastPartnerMap.set(station, { partner, timestamp });

        // Add to hub connection
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
        // Find the partner from recent activity
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

        // Add to hub connection
        const connectionId = createConnectionId(station, disconnectPartner);
        if (hubConnections.has(connectionId)) {
          const hub = hubConnections.get(connectionId)!;
          hub.disconnectRecords.push(record);
          hub.totalTxBytes += txBytes;
          hub.totalRxBytes += rxBytes;
        }
      }
    }

    // Calculate average S/N for each hub connection
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
  }, [rawData, allowedSet]);

  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return { data, loading, error, refetch, lastUpdated, isRefreshing };
}
