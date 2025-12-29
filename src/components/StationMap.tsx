import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Map, Radio, Wifi, Signal, Eye, EyeOff, Building2, Users } from 'lucide-react';
import { StationLocation } from '@/hooks/useStationLocations';
import { HubConnection } from '@/lib/syslogParser';

// Fix for default marker icons in Leaflet with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker icons
const createCustomIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

const HUB_STATION_COLOR = '#3b82f6'; // Blue for hub stations
const POLLING_STATION_COLOR = '#f97316'; // Orange for polling stations

interface StationMapProps {
  locations: Map<string, StationLocation>;
  hubConnections: Map<string, HubConnection>;
  distances: Map<string, number>;
  hubCallsigns: string[];
}

type ConnectionColorMode = 'snr' | 'bitrate' | 'sessions';
type StationFilter = 'hub' | 'all';

const getSnrColor = (snr: number): string => {
  if (snr >= 20) return '#10b981'; // Excellent - green
  if (snr >= 10) return '#22c55e'; // Good - light green
  if (snr >= 0) return '#f59e0b';  // Fair - yellow
  return '#ef4444';               // Poor - red
};

const getBitrateColor = (bitrate: number): string => {
  if (bitrate >= 5000) return '#10b981';
  if (bitrate >= 2000) return '#22c55e';
  if (bitrate >= 500) return '#f59e0b';
  return '#ef4444';
};

const getSessionColor = (sessions: number): string => {
  if (sessions >= 50) return '#10b981';
  if (sessions >= 20) return '#22c55e';
  if (sessions >= 5) return '#f59e0b';
  return '#ef4444';
};

export function StationMap({ locations, hubConnections, distances, hubCallsigns }: StationMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const connectionsRef = useRef<L.LayerGroup | null>(null);
  
  const [showConnections, setShowConnections] = useState(true);
  const [colorMode, setColorMode] = useState<ConnectionColorMode>('snr');
  const [stationFilter, setStationFilter] = useState<StationFilter>('hub');

  // Normalize hub callsigns for comparison
  const normalizedHubCallsigns = useMemo(() => 
    new Set(hubCallsigns.map(c => c.toUpperCase().trim())),
    [hubCallsigns]
  );

  // Get all unique callsigns from connections (for polling stations)
  const allConnectedCallsigns = useMemo(() => {
    const callsigns = new Set<string>();
    hubConnections.forEach(hub => {
      callsigns.add(hub.station1.toUpperCase());
      callsigns.add(hub.station2.toUpperCase());
    });
    return callsigns;
  }, [hubConnections]);

  // Categorize stations
  const { hubStations, pollingStations } = useMemo(() => {
    const hub: StationLocation[] = [];
    const polling: StationLocation[] = [];
    
    locations.forEach(loc => {
      if (loc.latitude && loc.longitude) {
        const upperCallsign = loc.callsign.toUpperCase();
        if (normalizedHubCallsigns.has(upperCallsign)) {
          hub.push(loc);
        } else if (allConnectedCallsigns.has(upperCallsign)) {
          polling.push(loc);
        }
      }
    });
    
    return { hubStations: hub, pollingStations: polling };
  }, [locations, normalizedHubCallsigns, allConnectedCallsigns]);

  // Get stations to display based on filter
  const displayedStations = useMemo(() => {
    if (stationFilter === 'hub') {
      return hubStations;
    }
    return [...hubStations, ...pollingStations];
  }, [stationFilter, hubStations, pollingStations]);

  // Calculate connection data for lines - only show lines where BOTH endpoints are visible
  const connectionLines = useMemo(() => {
    const lines: Array<{
      from: StationLocation;
      to: StationLocation;
      avgSnr: number;
      avgBitrate: number;
      sessions: number;
      distance: number | null;
    }> = [];

    // Create a set of displayed station callsigns for fast lookup
    const displayedCallsigns = new Set(displayedStations.map(s => s.callsign.toUpperCase()));

    hubConnections.forEach(hub => {
      const station1Upper = hub.station1.toUpperCase();
      const station2Upper = hub.station2.toUpperCase();
      
      // Only draw line if BOTH endpoints are displayed on the map
      if (!displayedCallsigns.has(station1Upper) || !displayedCallsigns.has(station2Upper)) {
        return;
      }

      const loc1 = locations.get(station1Upper);
      const loc2 = locations.get(station2Upper);
      
      if (loc1?.latitude && loc1?.longitude && loc2?.latitude && loc2?.longitude) {
        const avgBitrate = hub.disconnectRecords.length > 0
          ? hub.disconnectRecords.reduce((sum, r) => sum + Math.max(r.maxTxBps || 0, r.maxRxBps || 0), 0) / hub.disconnectRecords.length
          : 0;
        
        const key = [hub.station1, hub.station2].sort().join('↔');
        const distance = distances.get(key) ?? null;
        
        lines.push({
          from: loc1,
          to: loc2,
          avgSnr: hub.avgSN,
          avgBitrate,
          sessions: hub.sessionCount,
          distance,
        });
      }
    });

    return lines;
  }, [hubConnections, locations, distances, displayedStations]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapRef.current = L.map(mapContainer.current, {
      center: [39.8283, -98.5795], // Center of US
      zoom: 4,
      zoomControl: true,
    });

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapRef.current);

    // Create layer groups
    markersRef.current = L.layerGroup().addTo(mapRef.current);
    connectionsRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when stations change
  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;

    markersRef.current.clearLayers();

    displayedStations.forEach(station => {
      const isHub = normalizedHubCallsigns.has(station.callsign.toUpperCase());
      const color = isHub ? HUB_STATION_COLOR : POLLING_STATION_COLOR;
      const stationType = isHub ? 'Hub Station' : 'Polling Station';
      
      const marker = L.marker(
        [station.latitude!, station.longitude!],
        { icon: createCustomIcon(color) }
      );
      
      const popupContent = `
        <div class="p-2 min-w-[180px]">
          <div class="font-bold text-lg mb-1">${station.callsign}</div>
          <div class="text-xs font-medium mb-2" style="color: ${color}">${stationType}</div>
          ${station.grid_square ? `<div class="text-sm text-gray-600">Grid: ${station.grid_square}</div>` : ''}
          ${station.city || station.state ? `<div class="text-sm text-gray-600">${[station.city, station.state].filter(Boolean).join(', ')}</div>` : ''}
          <div class="text-xs text-gray-500 mt-1">${station.latitude?.toFixed(4)}, ${station.longitude?.toFixed(4)}</div>
        </div>
      `;
      
      marker.bindPopup(popupContent);
      markersRef.current!.addLayer(marker);
    });

    // Fit bounds if we have stations
    if (displayedStations.length > 0) {
      const bounds = L.latLngBounds(
        displayedStations.map(s => [s.latitude!, s.longitude!] as [number, number])
      );
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [displayedStations, normalizedHubCallsigns]);

  // Update connection lines
  useEffect(() => {
    if (!mapRef.current || !connectionsRef.current) return;

    connectionsRef.current.clearLayers();

    if (!showConnections) return;

    connectionLines.forEach(conn => {
      let color: string;
      let weight: number;

      switch (colorMode) {
        case 'snr':
          color = getSnrColor(conn.avgSnr);
          weight = Math.max(2, Math.min(6, conn.avgSnr / 5));
          break;
        case 'bitrate':
          color = getBitrateColor(conn.avgBitrate);
          weight = Math.max(2, Math.min(6, conn.avgBitrate / 1000));
          break;
        case 'sessions':
          color = getSessionColor(conn.sessions);
          weight = Math.max(2, Math.min(6, conn.sessions / 10));
          break;
      }

      const line = L.polyline(
        [
          [conn.from.latitude!, conn.from.longitude!],
          [conn.to.latitude!, conn.to.longitude!],
        ],
        {
          color,
          weight,
          opacity: 0.7,
        }
      );

      const tooltipContent = `
        <div class="p-1">
          <div class="font-semibold">${conn.from.callsign} ↔ ${conn.to.callsign}</div>
          <div class="text-sm">Avg S/N: ${conn.avgSnr.toFixed(1)} dB</div>
          <div class="text-sm">Sessions: ${conn.sessions}</div>
          ${conn.distance ? `<div class="text-sm">Distance: ${conn.distance} mi</div>` : ''}
        </div>
      `;

      line.bindTooltip(tooltipContent, { sticky: true });
      connectionsRef.current!.addLayer(line);
    });
  }, [connectionLines, showConnections, colorMode]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5" />
            Station Map
          </CardTitle>
          
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-xs gap-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: HUB_STATION_COLOR }} />
              {hubStations.length} hub
            </Badge>
            <Badge variant="secondary" className="text-xs gap-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: POLLING_STATION_COLOR }} />
              {pollingStations.length} polling
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <Wifi className="h-3 w-3 mr-1" />
              {connectionLines.length} connections
            </Badge>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {/* Station filter */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Show:</span>
            <Button
              variant={stationFilter === 'hub' ? "default" : "outline"}
              size="sm"
              onClick={() => setStationFilter('hub')}
              className="gap-1.5"
            >
              <Building2 className="h-3.5 w-3.5" />
              Hub Only
            </Button>
            <Button
              variant={stationFilter === 'all' ? "default" : "outline"}
              size="sm"
              onClick={() => setStationFilter('all')}
              className="gap-1.5"
            >
              <Users className="h-3.5 w-3.5" />
              All Stations
            </Button>
          </div>

          <div className="h-4 w-px bg-border mx-1" />

          <Button
            variant={showConnections ? "default" : "outline"}
            size="sm"
            onClick={() => setShowConnections(!showConnections)}
            className="gap-1.5"
          >
            {showConnections ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Connections
          </Button>

          {showConnections && (
            <div className="flex items-center gap-1 ml-2">
              <span className="text-xs text-muted-foreground mr-1">Color by:</span>
              <Button
                variant={colorMode === 'snr' ? "default" : "outline"}
                size="sm"
                onClick={() => setColorMode('snr')}
              >
                <Signal className="h-3.5 w-3.5 mr-1" />
                S/N
              </Button>
              <Button
                variant={colorMode === 'bitrate' ? "default" : "outline"}
                size="sm"
                onClick={() => setColorMode('bitrate')}
              >
                Bitrate
              </Button>
              <Button
                variant={colorMode === 'sessions' ? "default" : "outline"}
                size="sm"
                onClick={() => setColorMode('sessions')}
              >
                Sessions
              </Button>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-medium">Stations:</span>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: HUB_STATION_COLOR }} />
              <span>Hub</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: POLLING_STATION_COLOR }} />
              <span>Polling</span>
            </div>
          </div>
          
          {showConnections && (
            <>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-2">
                <span className="font-medium">Quality:</span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-[#10b981]" />
                  <span>Excellent</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
                  <span>Good</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                  <span>Fair</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
                  <span>Poor</span>
                </div>
              </div>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div 
          ref={mapContainer} 
          className="h-[500px] w-full"
          style={{ background: 'hsl(var(--muted))' }}
        />
      </CardContent>
    </Card>
  );
}
