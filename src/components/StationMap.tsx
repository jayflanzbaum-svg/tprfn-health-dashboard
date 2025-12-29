import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Map, Radio, Wifi, Signal, Eye, EyeOff } from 'lucide-react';
import { StationLocation } from '@/hooks/useStationLocations';
import { HubConnection, getSignalQuality } from '@/lib/syslogParser';

// Fix for default marker icons in Leaflet with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface StationMapProps {
  locations: Map<string, StationLocation>;
  hubConnections: Map<string, HubConnection>;
  distances: Map<string, number>;
}

type ConnectionColorMode = 'snr' | 'bitrate' | 'sessions';

const getSnrColor = (snr: number): string => {
  if (snr >= 20) return '#10b981'; // Excellent - green
  if (snr >= 10) return '#22c55e'; // Good - light green
  if (snr >= 0) return '#f59e0b';  // Fair - yellow
  return '#ef4444';               // Poor - red
};

const getBitrateColor = (bitrate: number): string => {
  if (bitrate >= 5000) return '#10b981'; // High
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

export function StationMap({ locations, hubConnections, distances }: StationMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const connectionsRef = useRef<L.LayerGroup | null>(null);
  
  const [showConnections, setShowConnections] = useState(true);
  const [colorMode, setColorMode] = useState<ConnectionColorMode>('snr');

  // Get stations with valid coordinates
  const validStations = useMemo(() => {
    const stations: StationLocation[] = [];
    locations.forEach(loc => {
      if (loc.latitude && loc.longitude) {
        stations.push(loc);
      }
    });
    return stations;
  }, [locations]);

  // Calculate connection data for lines
  const connectionLines = useMemo(() => {
    const lines: Array<{
      from: StationLocation;
      to: StationLocation;
      avgSnr: number;
      avgBitrate: number;
      sessions: number;
      distance: number | null;
    }> = [];

    hubConnections.forEach(hub => {
      const loc1 = locations.get(hub.station1.toUpperCase());
      const loc2 = locations.get(hub.station2.toUpperCase());
      
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
  }, [hubConnections, locations, distances]);

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

    validStations.forEach(station => {
      const marker = L.marker([station.latitude!, station.longitude!]);
      
      const popupContent = `
        <div class="p-2 min-w-[180px]">
          <div class="font-bold text-lg mb-2">${station.callsign}</div>
          ${station.grid_square ? `<div class="text-sm text-gray-600">Grid: ${station.grid_square}</div>` : ''}
          ${station.city || station.state ? `<div class="text-sm text-gray-600">${[station.city, station.state].filter(Boolean).join(', ')}</div>` : ''}
          <div class="text-xs text-gray-500 mt-1">${station.latitude?.toFixed(4)}, ${station.longitude?.toFixed(4)}</div>
          <div class="text-xs text-gray-400 mt-1">Source: ${station.source}</div>
        </div>
      `;
      
      marker.bindPopup(popupContent);
      markersRef.current!.addLayer(marker);
    });

    // Fit bounds if we have stations
    if (validStations.length > 0) {
      const bounds = L.latLngBounds(
        validStations.map(s => [s.latitude!, s.longitude!] as [number, number])
      );
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [validStations]);

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

  const stationCount = validStations.length;
  const connectionCount = connectionLines.length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5" />
            Station Map
          </CardTitle>
          
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <Radio className="h-3 w-3 mr-1" />
              {stationCount} stations
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <Wifi className="h-3 w-3 mr-1" />
              {connectionCount} connections
            </Badge>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
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
        {showConnections && (
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span>Legend:</span>
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
        )}
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
