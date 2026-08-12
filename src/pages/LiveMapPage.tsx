import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatabaseData } from '@/hooks/useDatabaseData';
import { useStationLocations } from '@/hooks/useStationLocations';
import { useHubCallsigns } from '@/hooks/useHubCallsigns';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { LiveStationMap } from '@/components/LiveStationMap';
import { LoadingState } from '@/components/LoadingState';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Code2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_ALLOWED_CALLSIGNS, HubConnection } from '@/lib/syslogParser';

const PUBLIC_ORIGIN = 'https://tprfn-health-dashboard.lovable.app';
const SNAPSHOT_ENDPOINT =
  'https://lcrayouskoctmbecomoi.supabase.co/functions/v1/map-snapshot';
const EMBED_PARAMS = ['preset', 'start', 'end', 'station', 'filter', 'mode', 'stations'];


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
  const [embedOpen, setEmbedOpen] = useState(false);

  // Only forward the map-relevant params (drops internal preview params)
  const embedQuery = useMemo(() => {
    const src = new URLSearchParams(window.location.search);
    const out = new URLSearchParams();
    EMBED_PARAMS.forEach((key) => {
      const value = src.get(key);
      if (value) out.set(key, value);
    });
    const qs = out.toString();
    return qs ? `?${qs}` : '';
  }, [embedOpen]);

  const iframeSnippet = `<iframe src="${PUBLIC_ORIGIN}/embed${embedQuery}" width="100%" height="560" style="border:0;border-radius:8px" loading="lazy" title="TPRFN Live Station Map"></iframe>`;

  const imgSnippet = (() => {
    const params = new URLSearchParams(embedQuery.replace(/^\?/, ''));
    params.set('width', '1200');
    params.set('height', '675');
    params.set('ttl', '600');
    return `<img src="${SNAPSHOT_ENDPOINT}?${params.toString()}" alt="TPRFN Live Station Map" width="600" style="max-width:100%;height:auto;border-radius:8px" />`;
  })();

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('Embed code copied to clipboard'),
      () => toast.error('Could not copy embed code')
    );
  };



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
          <Button
            variant="outline"
            size="sm"
            className="gap-2 ml-auto"
            onClick={() => setEmbedOpen(true)}
          >
            <Code2 className="h-4 w-4" />
            Copy Embed Code
          </Button>
        </div>

        <Dialog open={embedOpen} onOpenChange={setEmbedOpen}>
          <DialogContent className="max-w-2xl bg-background z-[1400]">
            <DialogHeader>
              <DialogTitle>Embed the Live Station Map</DialogTitle>
              <DialogDescription>
                Both snippets point at the published site, so they work on any external page.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Interactive map (iframe)</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Use on sites that allow iframes (WordPress, Wix, Squarespace).
                </p>
                <pre className="rounded-md border bg-muted p-3 text-xs whitespace-pre-wrap break-all">{iframeSnippet}</pre>
                <Button size="sm" variant="secondary" className="mt-2 gap-2" onClick={() => copy(iframeSnippet)}>
                  <Copy className="h-3.5 w-3.5" /> Copy iframe code
                </Button>
              </div>

              <div>
                <p className="text-sm font-medium mb-1">Auto-updating image (QRZ, forums)</p>
                <p className="text-xs text-muted-foreground mb-2">
                  A PNG snapshot that refreshes every 10 minutes — works where iframes and scripts are blocked.
                </p>
                <pre className="rounded-md border bg-muted p-3 text-xs whitespace-pre-wrap break-all">{imgSnippet}</pre>
                <Button size="sm" variant="secondary" className="mt-2 gap-2" onClick={() => copy(imgSnippet)}>
                  <Copy className="h-3.5 w-3.5" /> Copy image code
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        
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