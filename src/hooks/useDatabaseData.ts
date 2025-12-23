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
  total_bytes: number | null;
  bandwidth: number | null;
  frequency: number | null;
  raw_message: string;
}

function createConnectionId(station1: string, station2: string): string {
  const sorted = [station1, station2].sort();
  return `${sorted[0]}↔${sorted[1]}`;
}

export function useDatabaseData(allowedCallsigns: string[]) {
  const [rawData, setRawData] = useState<DatabaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const allowedSet = useMemo(() => 
    new Set(allowedCallsigns.map(c => c.toUpperCase().trim())), 
    [allowedCallsigns]
  );

  const fetchData = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      
      console.log('Fetching syslog data from database...');
      
      // Fetch entries from the last 30 days to avoid timeout issues
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const allEntries: DatabaseEntry[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      const maxPages = 100; // Safety limit

      while (hasMore && page < maxPages) {
        const { data: entries, error: queryError } = await supabase
          .from('syslog_entries')
          .select('*')
          .gte('timestamp', thirtyDaysAgo.toISOString())
          .order('timestamp', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (queryError) {
          throw new Error(queryError.message);
        }

        if (entries && entries.length > 0) {
          allEntries.push(...entries);
          page++;
          hasMore = entries.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      console.log(`Fetched ${allEntries.length} entries from database (last 30 days)`);
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
  }, []);

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

      if (entry.event_type === 'snr' && entry.snr !== null && partner) {
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

      if (entry.event_type === 'connect' && partner) {
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

      if (entry.event_type === 'disconnect') {
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
          disconnectType: entry.raw_message.toLowerCase().includes('timeout') ? 'timeout' : 'normal'
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
