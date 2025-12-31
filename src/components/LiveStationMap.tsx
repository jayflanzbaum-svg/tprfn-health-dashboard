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
      width: ${isActive ? 16 : 14}px;
      height: ${isActive ? 16 : 14}px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.4)${isActive ? ', 0 0 10px ' + color : ''};
      ${isActive ? 'animation: pulse 1.5s ease-in-out infinite;' : ''}
    "></div>`,
    iconSize: [isActive ? 16 : 14, isActive ? 16 : 14],
    iconAnchor: [isActive ? 8 : 7, isActive ? 8 : 7],
    popupAnchor: [0, isActive ? -8 : -7],
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
  lookupCallsigns?: (callsigns: string[]) => void;
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

// CSS for GridTracker-style connection lines
const animationStyles = `
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.2); opacity: 0.8; }
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Keep SVG stroke + dash pattern consistent while zooming */
  .live-connection-dash {
    vector-effect: non-scaling-stroke;
  }
  
  .activity-item {
    animation: fadeIn 0.3s ease-out;
  }
`;

// Calculate great circle arc points between two coordinates
const getGreatCirclePoints = (
  lat1: number, lon1: number, 
  lat2: number, lon2: number, 
  numPoints: number = 50
): [number, number][] => {
  const toRad = (deg: number) => deg * Math.PI / 180;
  const toDeg = (rad: number) => rad * 180 / Math.PI;
  
  const φ1 = toRad(lat1);
  const λ1 = toRad(lon1);
  const φ2 = toRad(lat2);
  const λ2 = toRad(lon2);
  
  const points: [number, number][] = [];
  
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    
    const d = Math.acos(
      Math.sin(φ1) * Math.sin(φ2) + 
      Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)
    );
    
    if (d === 0) {
      points.push([lat1, lon1]);
      continue;
    }
    
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    
    const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
    const λ = Math.atan2(y, x);
    
    points.push([toDeg(φ), toDeg(λ)]);
  }
  
  return points;
};

export function LiveStationMap({ 
  locations, 
  hubConnections, 
  distances, 
  hubCallsigns,
  isFullscreen = false,
  lookupCallsigns 
}: LiveStationMapProps) {
  const navigate = useNavigate();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const connectionsRef = useRef<L.LayerGroup | null>(null);
  const liveConnectionsRef = useRef<L.LayerGroup | null>(null);
  const svgRendererRef = useRef<L.SVG | null>(null);
  
  const [showConnections, setShowConnections] = useState(true);
  const [colorMode, setColorMode] = useState<ConnectionColorMode>('live');
  const [stationFilter, setStationFilter] = useState<StationFilter>('hub');
  const [liveMode, setLiveMode] = useState(true);
  const [liveConnections, setLiveConnections] = useState<LiveConnection[]>([]);
  const [activityFeed, setActivityFeed] = useState<LiveConnection[]>([]);
  const [activeStations, setActiveStations] = useState<Set<string>>(new Set());
  const [mapReady, setMapReady] = useState(false);
  const stylesInjectedRef = useRef(false);

  // Inject animation styles only once
  useEffect(() => {
    if (stylesInjectedRef.current) return;
    stylesInjectedRef.current = true;
    const styleEl = document.createElement('style');
    styleEl.id = 'live-station-map-styles';
    if (!document.getElementById('live-station-map-styles')) {
      styleEl.textContent = animationStyles;
      document.head.appendChild(styleEl);
    }
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

  // Get callsigns of stations that have active live connections
  const liveConnectedCallsigns = useMemo(() => {
    const callsigns = new Set<string>();
    liveConnections.forEach(conn => {
      callsigns.add(conn.station1.toUpperCase());
      if (conn.station2) {
        callsigns.add(conn.station2.toUpperCase());
      }
    });
    return callsigns;
  }, [liveConnections]);

  // Get stations to display based on filter
  // When HUB ONLY filter is active, still show polling stations that are connected to a hub
  const displayedStations = useMemo(() => {
    if (stationFilter === 'hub') {
      // Show all hubs, plus any polling stations that are actively connected
      const connectedPolling = pollingStations.filter(station => 
        liveConnectedCallsigns.has(station.callsign.toUpperCase())
      );
      return [...hubStations, ...connectedPolling];
    }
    return [...hubStations, ...pollingStations];
  }, [stationFilter, hubStations, pollingStations, liveConnectedCallsigns]);

  // Create a lookup object for ALL stations (needed for drawing live connection lines)
  const allStationsLookup = useMemo(() => {
    const lookup: Record<string, StationLocation> = {};
    locations.forEach(s => {
      if (s.latitude && s.longitude) {
        lookup[s.callsign.toUpperCase()] = s;
      }
    });
    return lookup;
  }, [locations]);

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

  // Live window: connections within last 15 minutes are considered "live"
  const LIVE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  const LIVE_SYSLOG_URL = 'https://tprfn.k1ajd.net/VARAHF.txt';
  const LIVE_REFRESH_INTERVAL_MS = 30 * 1000; // Refresh every 30 seconds

  // Parse syslog text to extract recent connections
  const parseLiveSyslog = useCallback((content: string): LiveConnection[] => {
    const lines = content.split('\n');
    const connections: LiveConnection[] = [];
    const nowMs = Date.now();
    const cutoffMs = nowMs - LIVE_WINDOW_MS;
    const currentYear = new Date(nowMs).getUTCFullYear();
    
    console.log(
      `Parsing syslog: ${lines.length} lines, cutoff: ${new Date(cutoffMs).toISOString()}, now: ${new Date(nowMs).toISOString()}`
    );

    // Regex patterns for parsing - use \s+ to handle variable whitespace
    const snPattern = /^(\w+\s+\d+\s+\d+:\d+:\d+)\s+(H-[\w-]+)\s+VARAHF\s+([\w/-]+)\s+Average\s+S\/N:\s*([-\d.]+)\s*dB/;
    const connectOutPattern = /^(\w+\s+\d+\s+\d+:\d+:\d+)\s+(H-[\w-]+)\s+VARAHF\s+Connected\s+to\s+([\w/-]+)/;
    const connectInPattern = /^(\w+\s+\d+\s+\d+:\d+:\d+)\s+(H-[\w-]+)\s+VARAHF\s+([\w/-]+)\s+connected/i;
    const disconnectPattern = /^(\w+\s+\d+\s+\d+:\d+:\d+)\s+(H-[\w-]+)\s+VARAHF\s+Disconnected/;

    const parseTimestamp = (dateStr: string): number | null => {
      // Parse "Dec 31 01:28:49" format (no year, assumed UTC)
      const parts = dateStr.match(/(\w+)\s+(\d+)\s+(\d+):(\d+):(\d+)/);
      if (!parts) return null;

      const [, month, day, hour, min, sec] = parts;
      const monthMap: Record<string, number> = {
        Jan: 0,
        Feb: 1,
        Mar: 2,
        Apr: 3,
        May: 4,
        Jun: 5,
        Jul: 6,
        Aug: 7,
        Sep: 8,
        Oct: 9,
        Nov: 10,
        Dec: 11,
      };

      const monthNum = monthMap[month];
      if (monthNum === undefined) return null;

      const dayNum = parseInt(day, 10);
      const hourNum = parseInt(hour, 10);
      const minNum = parseInt(min, 10);
      const secNum = parseInt(sec, 10);

      const parsedMs = Date.UTC(currentYear, monthNum, dayNum, hourNum, minNum, secNum);

      // If we are in early January but parsing late December lines, parsedMs could be ~days in the future.
      const oneDayMs = 24 * 60 * 60 * 1000;
      if (parsedMs - nowMs > oneDayMs) {
        return Date.UTC(currentYear - 1, monthNum, dayNum, hourNum, minNum, secNum);
      }

      return parsedMs;
    };

    const extractStation = (hostname: string): string => {
      return hostname.startsWith('H-') ? hostname.substring(2) : hostname;
    };

    const normalizeCallsign = (callsign: string): string => {
      return callsign.replace(/-\d+$/, '').toUpperCase();
    };

    // Track last partner for disconnect matching
    const lastPartner: Record<string, string> = {};

    for (const line of lines) {
      // Parse S/N records
      const snMatch = line.match(snPattern);
      if (snMatch) {
        const timestampMs = parseTimestamp(snMatch[1]);
        if (timestampMs === null || timestampMs < cutoffMs) continue;
        const timestamp = new Date(timestampMs);

        const station = normalizeCallsign(extractStation(snMatch[2]));
        const partner = normalizeCallsign(snMatch[3]);
        const snr = parseFloat(snMatch[4]);

        lastPartner[station] = partner;

        connections.push({
          id: `sn-${timestampMs}-${station}-${partner}`,
          station1: station,
          station2: partner,
          eventType: 'sn_report',
          snr,
          timestamp,
          hub: snMatch[2],
        });
        continue;
      }

      // Parse connect (outgoing)
      const connectOutMatch = line.match(connectOutPattern);
      if (connectOutMatch) {
        const timestampMs = parseTimestamp(connectOutMatch[1]);
        if (timestampMs === null || timestampMs < cutoffMs) continue;
        const timestamp = new Date(timestampMs);

        const station = normalizeCallsign(extractStation(connectOutMatch[2]));
        const partner = normalizeCallsign(connectOutMatch[3]);

        lastPartner[station] = partner;

        connections.push({
          id: `conn-${timestampMs}-${station}-${partner}`,
          station1: station,
          station2: partner,
          eventType: 'connect',
          timestamp,
          hub: connectOutMatch[2],
        });
        continue;
      }

      // Parse connect (incoming)
      const connectInMatch = line.match(connectInPattern);
      if (connectInMatch) {
        const timestampMs = parseTimestamp(connectInMatch[1]);
        if (timestampMs === null || timestampMs < cutoffMs) continue;
        const timestamp = new Date(timestampMs);

        const station = normalizeCallsign(extractStation(connectInMatch[2]));
        const partner = normalizeCallsign(connectInMatch[3]);

        lastPartner[station] = partner;

        connections.push({
          id: `conn-${timestampMs}-${station}-${partner}`,
          station1: station,
          station2: partner,
          eventType: 'connect',
          timestamp,
          hub: connectInMatch[2],
        });
        continue;
      }

      // Parse disconnect
      const disconnectMatch = line.match(disconnectPattern);
      if (disconnectMatch) {
        const timestampMs = parseTimestamp(disconnectMatch[1]);
        if (timestampMs === null || timestampMs < cutoffMs) continue;
        const timestamp = new Date(timestampMs);

        const station = normalizeCallsign(extractStation(disconnectMatch[2]));
        const partner = lastPartner[station] || '';

        connections.push({
          id: `disc-${timestampMs}-${station}`,
          station1: station,
          station2: partner,
          eventType: 'disconnect',
          timestamp,
          hub: disconnectMatch[2],
        });
      }
    }

    console.log(`Parsed ${connections.length} connections after filtering by time`);
    
    // Sort by timestamp descending (most recent first)
    return connections.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [LIVE_WINDOW_MS]);

  // Fetch live data directly from syslog URL
  const fetchLiveSyslog = useCallback(async () => {
    try {
      console.log('Fetching live syslog data for map...');
      const { data, error } = await supabase.functions.invoke('fetch-syslog');
      
      if (error) {
        console.error('Error fetching live syslog:', error);
        return;
      }

      if (data?.content) {
        const connections = parseLiveSyslog(data.content);
        console.log(`Parsed ${connections.length} live connections from syslog`);
        
        setLiveConnections(connections.slice(0, 100));
        setActivityFeed(connections.slice(0, 50));

        // Set active stations from recent connections
        const activeSet = new Set<string>();
        connections.forEach(conn => {
          activeSet.add(conn.station1.toUpperCase());
          if (conn.station2) {
            activeSet.add(conn.station2.toUpperCase());
          }
        });
        setActiveStations(activeSet);

        // Trigger lookup for any callsigns not already in locations
        if (lookupCallsigns) {
          const missingCallsigns = Array.from(activeSet).filter(
            callsign => !locations.has(callsign)
          );
          if (missingCallsigns.length > 0) {
            console.log(`Looking up ${missingCallsigns.length} new callsigns:`, missingCallsigns);
            lookupCallsigns(missingCallsigns);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching live syslog:', err);
    }
  }, [parseLiveSyslog, lookupCallsigns, locations]);

  // Fetch live data on mount and periodically
  useEffect(() => {
    if (!liveMode) return;

    // Initial fetch
    fetchLiveSyslog();

    // Set up polling interval
    const pollInterval = setInterval(fetchLiveSyslog, LIVE_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(pollInterval);
    };
  }, [liveMode, fetchLiveSyslog]);

  // Initialize map with delay to prevent blocking
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Defer map initialization to not block render
    const initTimer = setTimeout(() => {
      if (!mapContainer.current) return;
      
      mapRef.current = L.map(mapContainer.current, {
        center: [39.8283, -98.5795],
        zoom: 4,
        zoomControl: true,
        preferCanvas: true, // Better performance for many elements
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(mapRef.current);

      markersRef.current = L.layerGroup().addTo(mapRef.current);
      connectionsRef.current = L.layerGroup().addTo(mapRef.current);
      liveConnectionsRef.current = L.layerGroup().addTo(mapRef.current);

      // Render live dashed lines in SVG so dash pattern stays consistent across zoom transforms
      svgRendererRef.current = L.svg({ padding: 0.5 });
      svgRendererRef.current.addTo(mapRef.current);

      setMapReady(true);
    }, 100);

    return () => {
      clearTimeout(initTimer);
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Update markers when stations change
  useEffect(() => {
    if (!mapReady || !mapRef.current || !markersRef.current) return;

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
  }, [displayedStations, normalizedHubCallsigns, activeStations, mapReady]);

  // Update static connection lines
  useEffect(() => {
    if (!mapReady || !mapRef.current || !connectionsRef.current) return;

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
  }, [connectionLines, showConnections, colorMode, mapReady]);

  // Update live connection animations
  useEffect(() => {
    if (!mapReady || !mapRef.current || !liveConnectionsRef.current) return;

    liveConnectionsRef.current.clearLayers();

    if (colorMode !== 'live' || !liveMode) return;

    liveConnections.forEach(conn => {
      const station1Upper = conn.station1.toUpperCase();
      const station2Upper = conn.station2?.toUpperCase();
      
      if (!station2Upper) return;
      
      // Use allStationsLookup so we can draw lines to any station with a known location
      const loc1 = allStationsLookup[station1Upper];
      const loc2 = allStationsLookup[station2Upper];
      
      if (!loc1 || !loc2) return;

      const lineColor = conn.snr ? getSnrColor(conn.snr) : ACTIVE_CONNECTION_COLOR;
      
      // Calculate great circle arc for curved path like GridTracker
      // station1 is the initiator (hub), station2 is the connected station
      const arcCoords = getGreatCirclePoints(
        loc1.latitude!, loc1.longitude!,
        loc2.latitude!, loc2.longitude!,
        30
      );

      // GridTracker-style dashed line - GREEN to match live station markers
      // Must use SVG renderer for consistent dash appearance across zoom levels
      if (!svgRendererRef.current) return;
      
      const dashedLine = L.polyline(arcCoords, { 
        color: '#22c55e', // Green to match live station color
        weight: 2,
        opacity: 0.9,
        dashArray: '12, 8', // GridTracker-like
        lineCap: 'butt',
        lineJoin: 'round',
        renderer: svgRendererRef.current,
        className: 'live-connection-dash',
      });

      const tooltipContent = `
        <div class="p-1">
          <div class="font-semibold">${conn.station1} → ${conn.station2}</div>
          <div class="text-sm">Event: ${conn.eventType}</div>
          ${conn.snr ? `<div class="text-sm">S/N: ${conn.snr} dB</div>` : ''}
          ${conn.bitrate ? `<div class="text-sm">Bitrate: ${conn.bitrate} bps</div>` : ''}
          <div class="text-xs text-gray-500">${format(conn.timestamp, 'HH:mm:ss')}</div>
        </div>
      `;

      dashedLine.bindTooltip(tooltipContent, { sticky: true });
      liveConnectionsRef.current!.addLayer(dashedLine);
    });
  }, [liveConnections, colorMode, liveMode, allStationsLookup, mapReady]);

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
            className={`${mapHeight} ${isFullscreen ? 'flex-1' : 'w-full lg:flex-1'} relative`}
            style={{ background: 'hsl(var(--muted))' }}
          >
            {!mapReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <div className="text-center">
                  <Map className="h-8 w-8 mx-auto mb-2 animate-pulse text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading map...</p>
                </div>
              </div>
            )}
          </div>
          
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
