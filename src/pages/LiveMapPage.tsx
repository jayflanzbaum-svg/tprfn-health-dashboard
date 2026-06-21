import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatabaseData } from '@/hooks/useDatabaseData';
import { useStationLocations } from '@/hooks/useStationLocations';
import { useHubCallsigns } from '@/hooks/useHubCallsigns';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { LiveStationMap } from '@/components/LiveStationMap';
import { LoadingState } from '@/components/LoadingState';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DEFAULT_ALLOWED_CALLSIGNS, HubConnection } from '@/lib/syslogParser';

const LiveMapPage = () => {
  const navigate = useNavigate();
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

  // Auto-fetch locations for all stations when data loads
  useEffect(() => {
    if (data && data.stations.size > 0) {
      const callsigns = Array.from(data.stations);
      lookupCallsigns(callsigns);
    }
  }, [data?.stations.size]);

  if (!callsignsLoaded || loading) {
    return <LoadingState message="Loading map data..." />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error || 'Failed to load data'}</p>
          <Button onClick={() => navigate('/')}>Return to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4 max-w-full">
        <div className="mb-4 flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          <h1 className="text-xl font-bold">Live Station Map</h1>
        </div>
        
        <LiveStationMap
          locations={locations}
          hubConnections={filteredHubConnections}
          distances={distances}
          hubCallsigns={allowedCallsigns}
          isFullscreen={true}
          lookupCallsigns={lookupCallsigns}
        />
      </div>
    </div>
  );
};

export default LiveMapPage;