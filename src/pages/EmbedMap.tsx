import { useEffect, useMemo } from 'react';
import { useDatabaseData } from '@/hooks/useDatabaseData';
import { useStationLocations } from '@/hooks/useStationLocations';
import { useHubCallsigns } from '@/hooks/useHubCallsigns';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { LiveStationMap } from '@/components/LiveStationMap';
import { LoadingState } from '@/components/LoadingState';
import { DEFAULT_ALLOWED_CALLSIGNS, HubConnection } from '@/lib/syslogParser';

/**
 * Chromeless map for embedding in other sites via <iframe>.
 * Supports the same URL params as the live map (preset, start, end, station, filter, mode...).
 */
const EmbedMap = () => {
  const { callsigns: allowedCallsigns, loaded: callsignsLoaded } = useHubCallsigns();
  const { filters } = useUrlFilters(DEFAULT_ALLOWED_CALLSIGNS);

  const fetchDays = useMemo(() => {
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.ceil((filters.dateRange.end.getTime() - filters.dateRange.start.getTime()) / msPerDay) + 1;
    return Math.max(2, days);
  }, [filters.dateRange]);

  const { data, loading, error } = useDatabaseData(allowedCallsigns, fetchDays);
  const { locations, distances, lookupCallsigns } = useStationLocations();

  const filteredHubConnections = useMemo(() => {
    if (!data) return new Map<string, HubConnection>();

    const inRange = (timestamp: Date) => timestamp >= filters.dateRange.start && timestamp <= filters.dateRange.end;
    const matchesStation = (station: string, partner: string) =>
      !filters.selectedStation || station === filters.selectedStation || partner === filters.selectedStation;

    if (data.aggregatedData) {
      if (!filters.selectedStation) return data.hubConnections;
      const filtered = new Map<string, HubConnection>();
      data.hubConnections.forEach((hub, key) => {
        if (matchesStation(hub.station1, hub.station2)) filtered.set(key, hub);
      });
      return filtered;
    }

    const hubConnections = new Map<string, HubConnection>();
    const ensureHub = (station: string, partner: string) => {
      const sorted = [station, partner].sort();
      const connectionId = `${sorted[0]}↔${sorted[1]}`;
      if (!hubConnections.has(connectionId)) {
        hubConnections.set(connectionId, {
          station1: sorted[0],
          station2: sorted[1],
          connectionId,
          snRecords: [],
          connectRecords: [],
          disconnectRecords: [],
          avgSN: 0,
          totalTxBytes: 0,
          totalRxBytes: 0,
          sessionCount: 0,
        });
      }
      return hubConnections.get(connectionId)!;
    };

    data.snRecords.filter(r => inRange(r.timestamp) && matchesStation(r.station, r.partner)).forEach(record => {
      ensureHub(record.station, record.partner).snRecords.push(record);
    });
    data.connectRecords.filter(r => inRange(r.timestamp) && matchesStation(r.station, r.partner)).forEach(record => {
      const hub = ensureHub(record.station, record.partner);
      hub.connectRecords.push(record);
      hub.sessionCount++;
    });
    data.disconnectRecords.filter(r => inRange(r.timestamp) && matchesStation(r.station, r.partner)).forEach(record => {
      const hub = ensureHub(record.station, record.partner);
      hub.disconnectRecords.push(record);
      hub.totalTxBytes += record.txBytes;
      hub.totalRxBytes += record.rxBytes;
    });

    hubConnections.forEach(hub => {
      if (hub.snRecords.length > 0) {
        hub.avgSN = hub.snRecords.reduce((sum, r) => sum + r.snValue, 0) / hub.snRecords.length;
      }
    });

    return hubConnections;
  }, [data, filters.dateRange, filters.selectedStation]);

  useEffect(() => {
    if (data && data.stations.size > 0) {
      lookupCallsigns(Array.from(data.stations));
    }
  }, [data?.stations.size]);

  useEffect(() => {
    document.title = 'TPRFN Live Station Map';
    document.body.classList.add('embed-mode');
    return () => document.body.classList.remove('embed-mode');
  }, []);

  if (!callsignsLoaded || loading) {
    return <LoadingState message="Loading map…" />;
  }

  if (error || !data) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <p className="text-sm text-destructive">{error || 'Failed to load map data'}</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <LiveStationMap
        locations={locations}
        hubConnections={filteredHubConnections}
        distances={distances}
        hubCallsigns={allowedCallsigns}
        isFullscreen={true}
        lookupCallsigns={lookupCallsigns}
      />
      <a
        href={`${window.location.origin}/`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2 left-2 z-[1200] rounded bg-background/85 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow hover:text-foreground"
      >
        Powered by TPRFN Health Dashboard
      </a>
    </div>
  );
};

export default EmbedMap;
