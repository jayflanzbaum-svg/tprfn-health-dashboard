import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Map, Radio, Wifi, Signal, Eye, EyeOff, Building2, Users, Maximize2, Activity, Clock, ArrowRightLeft, Zap } from 'lucide-react';
import { StationLocation } from '@/hooks/useStationLocations';
import { HubConnection, formatCallsign, formatBytes, formatDuration } from '@/lib/syslogParser';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

// Fix for default marker icons in Leaflet with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker icons
const createCustomIcon = (color: string, isActive = false) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: ${isActive ? 28 : 24}px;
      height: ${isActive ? 28 : 24}px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.4)${isActive ? ', 0 0 15px ' + color : ''};
      ${isActive ? 'animation: pulse 1.5s ease-in-out infinite;' : ''}
    "></div>`,
    iconSize: [isActive ? 28 : 24, isActive ? 28 : 24],
    iconAnchor: [isActive ? 14 : 12, isActive ? 14 : 12],
    popupAnchor: [0, isActive ? -14 : -12],
  });
};

const HUB_STATION_COLOR = '#3b82f6';
const POLLING_STATION_COLOR = '#f97316';
const ACTIVE_CONNECTION_COLOR = '#22c55e';

interface LiveStationMapProps {
  locations: Map<string, StationLocation>;
  hubConnections: Map<string, HubConnection>;
  distances: Map<string, number>;
  hubCallsigns: string[];
  isFullscreen?: boolean;
}

interface LiveConnection {
  id: string;
  station1: string;
  station2: string;
  eventType: string;
  snr?: number;
  bitrate?: number;
  timestamp: Date;
  hub: string;
}

type ConnectionColorMode = 'snr' | 'bitrate' | 'sessions' | 'live';
type StationFilter = 'hub' | 'all';

const getSnrColor = (snr: number): string => {
  if (snr >= 20) return '#10b981';
  if (snr >= 10) return '#22c55e';
  if (snr >= 0) return '#f59e0b';
  return '#ef4444';
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

// CSS for animated flowing particles
const animationStyles = `
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.2); opacity: 0.8; }
  }
  
  @keyframes flowingDash {
    to { stroke-dashoffset: -30; }
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  .live-connection-line {
    stroke-dasharray: 10 5;
    animation: flowingDash 1s linear infinite;
  }
  
  .activity-item {
    animation: fadeIn 0.3s ease-out;
  }
`;

export function LiveStationMap({ 
  locations, 
  hubConnections, 
  distances, 
  hubCallsigns,
  isFullscreen = false 
}: LiveStationMapProps) {
  const navigate = useNavigate();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const connectionsRef = useRef<L.LayerGroup | null>(null);
  const liveConnectionsRef = useRef<L.LayerGroup | null>(null);
  
  const [showConnections, setShowConnections] = useState(true);
  const [colorMode, setColorMode] = useState<ConnectionColorMode>('live');
  const [stationFilter, setStationFilter] = useState<StationFilter>('hub');
  const [liveMode, setLiveMode] = useState(true);
  const [liveConnections, setLiveConnections] = useState<LiveConnection[]>([]);
  const [activityFeed, setActivityFeed] = useState<LiveConnection[]>([]);
  const [activeStations, setActiveStations] = useState<Set<string>>(new Set());

  // Inject animation styles
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.textContent = animationStyles;
    document.head.appendChild(styleEl);
    return () => { document.head.removeChild(styleEl); };
  }, []);

  // Normalize hub callsigns for comparison
  const normalizedHubCallsigns = useMemo(() => 
    new Set(hubCallsigns.map(c => c.toUpperCase().trim())),
    [hubCallsigns]
  );

  // Get all unique callsigns from connections
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

  // Create a lookup object for displayed stations
  const displayedStationsLookup = useMemo(() => {
    const lookup: Record<string, StationLocation> = {};
    displayedStations.forEach(s => {
      lookup[s.callsign.toUpperCase()] = s;
    });
    return lookup;
  }, [displayedStations]);

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
      const station1Upper = hub.station1.toUpperCase();
      const station2Upper = hub.station2.toUpperCase();
      
      const loc1 = displayedStationsLookup[station1Upper];
      const loc2 = displayedStationsLookup[station2Upper];
      
      if (!loc1 || !loc2) return;

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
    });

    return lines;
  }, [hubConnections, distances, displayedStationsLookup]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!liveMode) return;

    const channel = supabase
      .channel('live-connections')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'syslog_entries'
        },
        (payload) => {
          const entry = payload.new as any;
          
          // Only process connect/disconnect events
          if (!['connect', 'disconnect', 'sn_report'].includes(entry.event_type)) return;
          
          const liveConn: LiveConnection = {
            id: entry.id,
            station1: entry.callsign,
            station2: entry.remote_callsign || '',
            eventType: entry.event_type,
            snr: entry.snr,
            bitrate: entry.bitrate,
            timestamp: new Date(entry.timestamp),
            hub: entry.hub,
          };
          
          // Update live connections (keep last 30 seconds)
          setLiveConnections(prev => {
            const cutoff = new Date(Date.now() - 30000);
            const filtered = prev.filter(c => c.timestamp > cutoff);
            return [liveConn, ...filtered].slice(0, 20);
          });
          
          // Update activity feed (keep last 50 entries)
          setActivityFeed(prev => [liveConn, ...prev].slice(0, 50));
          
          // Update active stations
          setActiveStations(prev => {
            const newSet = new Set(prev);
            newSet.add(entry.callsign.toUpperCase());
            if (entry.remote_callsign) {
              newSet.add(entry.remote_callsign.toUpperCase());
            }
            // Remove after 5 seconds
            setTimeout(() => {
              setActiveStations(curr => {
                const updated = new Set(curr);
                updated.delete(entry.callsign.toUpperCase());
                if (entry.remote_callsign) {
                  updated.delete(entry.remote_callsign.toUpperCase());
                }
                return updated;
              });
            }, 5000);
            return newSet;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveMode]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapRef.current = L.map(mapContainer.current, {
      center: [39.8283, -98.5795],
      zoom: 4,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapRef.current);

    markersRef.current = L.layerGroup().addTo(mapRef.current);
    connectionsRef.current = L.layerGroup().addTo(mapRef.current);
    liveConnectionsRef.current = L.layerGroup().addTo(mapRef.current);

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
      const isActive = activeStations.has(station.callsign.toUpperCase());
      const color = isActive ? ACTIVE_CONNECTION_COLOR : (isHub ? HUB_STATION_COLOR : POLLING_STATION_COLOR);
      const stationType = isHub ? 'Hub Station' : 'Polling Station';
      
      const marker = L.marker(
        [station.latitude!, station.longitude!],
        { icon: createCustomIcon(color, isActive) }
      );
      
      const popupContent = `
        <div class="p-2 min-w-[180px]">
          <div class="font-bold text-lg mb-1">${station.callsign}</div>
          <div class="text-xs font-medium mb-2" style="color: ${color}">${stationType}${isActive ? ' • ACTIVE' : ''}</div>
          ${station.grid_square ? `<div class="text-sm text-gray-600">Grid: ${station.grid_square}</div>` : ''}
          ${station.city || station.state ? `<div class="text-sm text-gray-600">${[station.city, station.state].filter(Boolean).join(', ')}</div>` : ''}
          <div class="text-xs text-gray-500 mt-1">${station.latitude?.toFixed(4)}, ${station.longitude?.toFixed(4)}</div>
        </div>
      `;
      
      marker.bindPopup(popupContent);
      markersRef.current!.addLayer(marker);
    });

    if (displayedStations.length > 0) {
      const bounds = L.latLngBounds(
        displayedStations.map(s => [s.latitude!, s.longitude!] as [number, number])
      );
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [displayedStations, normalizedHubCallsigns, activeStations]);

  // Update static connection lines
  useEffect(() => {
    if (!mapRef.current || !connectionsRef.current) return;

    connectionsRef.current.clearLayers();

    if (!showConnections || colorMode === 'live') return;

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
        default:
          color = '#6b7280';
          weight = 2;
      }

      const line = L.polyline(
        [
          [conn.from.latitude!, conn.from.longitude!],
          [conn.to.latitude!, conn.to.longitude!],
        ],
        { color, weight, opacity: 0.7 }
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

  // Update live connection animations
  useEffect(() => {
    if (!mapRef.current || !liveConnectionsRef.current) return;

    liveConnectionsRef.current.clearLayers();

    if (colorMode !== 'live' || !liveMode) return;

    liveConnections.forEach(conn => {
      const station1Upper = conn.station1.toUpperCase();
      const station2Upper = conn.station2?.toUpperCase();
      
      if (!station2Upper) return;
      
      const loc1 = displayedStationsLookup[station1Upper];
      const loc2 = displayedStationsLookup[station2Upper];
      
      if (!loc1 || !loc2) return;

      // Create animated SVG polyline
      const line = L.polyline(
        [
          [loc1.latitude!, loc1.longitude!],
          [loc2.latitude!, loc2.longitude!],
        ],
        { 
          color: conn.snr ? getSnrColor(conn.snr) : ACTIVE_CONNECTION_COLOR,
          weight: 4,
          opacity: 0.9,
          className: 'live-connection-line',
          dashArray: '10, 5',
        }
      );

      const tooltipContent = `
        <div class="p-1">
          <div class="font-semibold">${conn.station1} ↔ ${conn.station2}</div>
          <div class="text-sm">Event: ${conn.eventType}</div>
          ${conn.snr ? `<div class="text-sm">S/N: ${conn.snr} dB</div>` : ''}
          ${conn.bitrate ? `<div class="text-sm">Bitrate: ${conn.bitrate} bps</div>` : ''}
          <div class="text-xs text-gray-500">${format(conn.timestamp, 'HH:mm:ss')}</div>
        </div>
      `;

      line.bindTooltip(tooltipContent, { sticky: true });
      liveConnectionsRef.current!.addLayer(line);
    });
  }, [liveConnections, colorMode, liveMode, displayedStationsLookup]);

  const handleFullscreenToggle = useCallback(() => {
    if (isFullscreen) {
      navigate('/');
    } else {
      navigate('/live-map');
    }
  }, [isFullscreen, navigate]);

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'connect': return <ArrowRightLeft className="h-3 w-3 text-green-500" />;
      case 'disconnect': return <Wifi className="h-3 w-3 text-red-500" />;
      case 'sn_report': return <Signal className="h-3 w-3 text-blue-500" />;
      default: return <Activity className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const mapHeight = isFullscreen ? 'h-[calc(100vh-120px)]' : 'h-[500px]';

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5" />
            Station Map
            {liveMode && (
              <Badge variant="default" className="bg-green-500 hover:bg-green-500 gap-1 animate-pulse">
                <Zap className="h-3 w-3" />
                LIVE
              </Badge>
            )}
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
            {liveMode && activeStations.size > 0 && (
              <Badge variant="default" className="text-xs bg-green-500">
                <Activity className="h-3 w-3 mr-1" />
                {activeStations.size} active
              </Badge>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {/* Live Mode Toggle */}
          <Button
            variant={liveMode ? "default" : "outline"}
            size="sm"
            onClick={() => setLiveMode(!liveMode)}
            className={`gap-1.5 ${liveMode ? 'bg-green-500 hover:bg-green-600' : ''}`}
          >
            <Zap className="h-3.5 w-3.5" />
            Live Mode
          </Button>

          <div className="h-4 w-px bg-border mx-1" />

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
                variant={colorMode === 'live' ? "default" : "outline"}
                size="sm"
                onClick={() => setColorMode('live')}
                className={colorMode === 'live' ? 'bg-green-500 hover:bg-green-600' : ''}
              >
                <Zap className="h-3.5 w-3.5 mr-1" />
                Live
              </Button>
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

          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFullscreenToggle}
              className="gap-1.5"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </Button>
          </div>
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
            {liveMode && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: ACTIVE_CONNECTION_COLOR }} />
                <span>Active</span>
              </div>
            )}
          </div>
          
          {showConnections && colorMode !== 'live' && (
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
        <div className={`flex ${isFullscreen ? 'flex-row' : 'flex-col lg:flex-row'}`}>
          {/* Map */}
          <div 
            ref={mapContainer} 
            className={`${mapHeight} ${isFullscreen ? 'flex-1' : 'w-full lg:flex-1'}`}
            style={{ background: 'hsl(var(--muted))' }}
          />
          
          {/* Activity Feed */}
          {liveMode && (
            <div className={`${isFullscreen ? 'w-80' : 'w-full lg:w-72'} border-l border-border bg-card`}>
              <div className="p-3 border-b border-border">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Activity Feed
                </h3>
              </div>
              <ScrollArea className={isFullscreen ? 'h-[calc(100vh-180px)]' : 'h-[200px] lg:h-[440px]'}>
                <div className="p-2 space-y-1">
                  {activityFeed.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-8">
                      <Radio className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Waiting for live connections...</p>
                      <p className="text-xs mt-1">Events will appear here in real-time</p>
                    </div>
                  ) : (
                    activityFeed.map((event) => (
                      <div 
                        key={event.id} 
                        className="activity-item p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors text-xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            {getEventIcon(event.eventType)}
                            <span className="font-mono font-medium">
                              {formatCallsign(event.station1)}
                              {event.station2 && (
                                <span className="text-muted-foreground"> ↔ {formatCallsign(event.station2)}</span>
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="capitalize">{event.eventType.replace('_', ' ')}</span>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(event.timestamp, 'HH:mm:ss')}
                          </div>
                        </div>
                        {(event.snr || event.bitrate) && (
                          <div className="flex items-center gap-2 mt-1">
                            {event.snr && (
                              <span className="text-blue-500">S/N: {event.snr} dB</span>
                            )}
                            {event.bitrate && (
                              <span className="text-purple-500">{event.bitrate} bps</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
