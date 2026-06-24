import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Map, Radio, Wifi, Signal, Eye, EyeOff, Building2, Users, Maximize2, Activity, Clock, ArrowRightLeft, Zap, Share2, Plus, Minus } from 'lucide-react';
import { StationLocation } from '@/hooks/useStationLocations';
import { HubConnection, formatCallsign, formatBytes, formatDuration } from '@/lib/syslogParser';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useMapUrlState, ConnectionColorMode, StationFilter, MapMode } from '@/hooks/useMapUrlState';
import { useReplayPlayer, ReplayEvent } from '@/hooks/useReplayPlayer';
import { ReplayControls } from '@/components/ReplayControls';

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

// Types are imported from useMapUrlState

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

  @keyframes replayPopupFade {
    0%   { opacity: 0; }
    18%  { opacity: 1; }
    82%  { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes replayPopupSettle {
    0%   { transform: translateY(8px) scale(0.94); }
    18%  { transform: translateY(0) scale(1); }
    82%  { transform: translateY(0) scale(1); }
    100% { transform: translateY(-6px) scale(0.97); }
  }
  .replay-popup,
  .replay-callout {
    animation: replayPopupFade 3600ms ease-in-out forwards;
  }
  .replay-popup .leaflet-popup-content-wrapper,
  .replay-callout-box {
    animation: replayPopupSettle 3600ms ease-in-out forwards;
    background: rgba(17, 24, 39, 0.92);
    color: #fff;
    border: 1px solid rgba(168, 85, 247, 0.55);
    box-shadow: 0 4px 20px rgba(168, 85, 247, 0.35);
    border-radius: 8px;
    position: relative;
  }
  .replay-callout-box {
    box-sizing: border-box;
    width: 190px;
    padding: 8px 12px;
    font-size: 12px;
    line-height: 1.4;
    pointer-events: none;
  }
  .replay-popup .leaflet-popup-tip-container {
    display: none;
  }
  .replay-popup .leaflet-popup-content-wrapper::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -8px;
    width: 14px;
    height: 14px;
    transform: translateX(-50%) rotate(45deg);
    background: rgba(17, 24, 39, 0.92);
    border-right: 1px solid rgba(168, 85, 247, 0.55);
    border-bottom: 1px solid rgba(168, 85, 247, 0.55);
  }
  .replay-popup .leaflet-popup-content { margin: 8px 12px; font-size: 12px; line-height: 1.4; }
  .replay-callout-box::after {
    content: "";
    position: absolute;
    width: 14px;
    height: 14px;
    background: rgba(17, 24, 39, 0.92);
    border-color: rgba(168, 85, 247, 0.55);
    border-style: solid;
    transform: rotate(45deg);
  }
  .replay-callout-point-right::after {
    right: -8px;
    top: 50%;
    margin-top: -7px;
    border-width: 1px 1px 0 0;
  }
  .replay-callout-point-left::after {
    left: -8px;
    top: 50%;
    margin-top: -7px;
    border-width: 0 0 1px 1px;
  }
  .replay-callout-point-down::after {
    left: 50%;
    bottom: -8px;
    margin-left: -7px;
    border-width: 0 1px 1px 0;
  }
  .replay-callout-point-up::after {
    left: 50%;
    top: -8px;
    margin-left: -7px;
    border-width: 1px 0 0 1px;
  }

  @keyframes replayArcFade {
    0%   { opacity: 0; }
    15%  { opacity: 1; }
    80%  { opacity: 1; }
    100% { opacity: 0; }
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
  const replayLayerRef = useRef<L.LayerGroup | null>(null);

  // Use URL state for fullscreen mode, local state otherwise
  const urlState = useMapUrlState();

  // Local state for non-fullscreen mode
  const [localShowConnections, setLocalShowConnections] = useState(true);
  const [localColorMode, setLocalColorMode] = useState<ConnectionColorMode>('live');
  const [localStationFilter, setLocalStationFilter] = useState<StationFilter>('hub');
  const [localMode, setLocalMode] = useState<MapMode>('live');
  const [localReplayStart, setLocalReplayStart] = useState<string | null>(null);
  const [localReplayEnd, setLocalReplayEnd] = useState<string | null>(null);
  const [localReplaySpeed, setLocalReplaySpeed] = useState<number>(4);

  // Use URL state in fullscreen, local state otherwise
  const showConnections = isFullscreen ? urlState.showConnections : localShowConnections;
  const colorMode = isFullscreen ? urlState.colorMode : localColorMode;
  const stationFilter = isFullscreen ? urlState.stationFilter : localStationFilter;
  const mode: MapMode = isFullscreen ? urlState.mode : localMode;
  const liveMode = mode === 'live';
  const replayStart = isFullscreen ? urlState.replayStart : localReplayStart;
  const replayEnd = isFullscreen ? urlState.replayEnd : localReplayEnd;
  const replaySpeed = isFullscreen ? urlState.replaySpeed : localReplaySpeed;

  const setShowConnections = isFullscreen
    ? (val: boolean) => urlState.setState({ showConnections: val })
    : setLocalShowConnections;
  const setColorMode = isFullscreen
    ? (val: ConnectionColorMode) => urlState.setState({ colorMode: val })
    : setLocalColorMode;
  const setStationFilter = isFullscreen
    ? (val: StationFilter) => urlState.setState({ stationFilter: val })
    : setLocalStationFilter;
  const setMode = isFullscreen
    ? (val: MapMode) => urlState.setState({ mode: val })
    : setLocalMode;
  const setReplayRange = (s: string | null, e: string | null) => {
    if (isFullscreen) urlState.setState({ replayStart: s, replayEnd: e });
    else { setLocalReplayStart(s); setLocalReplayEnd(e); }
  };
  const setReplaySpeed = (s: number) => {
    if (isFullscreen) urlState.setState({ replaySpeed: s });
    else setLocalReplaySpeed(s);
  };

  const [liveConnections, setLiveConnections] = useState<LiveConnection[]>([]);
  const [activityFeed, setActivityFeed] = useState<LiveConnection[]>([]);
  const [activeStations, setActiveStations] = useState<Set<string>>(new Set());
  const [weekActiveStations, setWeekActiveStations] = useState<Set<string>>(new Set());
  const [visibleReplayStations, setVisibleReplayStations] = useState<Set<string>>(new Set());
  const [mapReady, setMapReady] = useState(false);
  const stylesInjectedRef = useRef(false);

  // Replay stats accumulated as events are emitted
  const replayStatsRef = useRef({ count: 0, snrSum: 0, snrCount: 0, distSum: 0, distCount: 0 });
  const [replayStats, setReplayStats] = useState({ count: 0, avgSnr: null as number | null, avgDistance: null as number | null });
  const resetReplayStats = useCallback(() => {
    replayStatsRef.current = { count: 0, snrSum: 0, snrCount: 0, distSum: 0, distCount: 0 };
    setReplayStats({ count: 0, avgSnr: null, avgDistance: null });
  }, []);

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

  // Categorize stations.
  // Polling stations are limited to callsigns seen in the recent live syslog
  // (activeStations) so the map only shows currently-participating stations
  // rather than every station that touched a hub within the dashboard date
  // range (which can be hundreds on a long preset like "today").
  const { hubStations, pollingStations } = useMemo(() => {
    const hub: StationLocation[] = [];
    const polling: StationLocation[] = [];

    locations.forEach(loc => {
      if (loc.latitude && loc.longitude) {
        const upperCallsign = loc.callsign.toUpperCase();
        if (normalizedHubCallsigns.has(upperCallsign)) {
          hub.push(loc);
        } else if (activeStations.has(upperCallsign)) {
          polling.push(loc);
        }
      }
    });

    return { hubStations: hub, pollingStations: polling };
  }, [locations, normalizedHubCallsigns, activeStations]);

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

  // Get stations to display based on filter.
  // In replay mode, reveal only endpoints that have appeared in the time-lapse,
  // not every cached station location from the database.
  const displayedStations = useMemo(() => {
    if (mode === 'replay' && stationFilter === 'all') {
      return Array.from(locations.values()).filter(station => {
        if (!station.latitude || !station.longitude) return false;
        const callsign = station.callsign.toUpperCase();
        return normalizedHubCallsigns.has(callsign) || visibleReplayStations.has(callsign);
      });
    }

    if (stationFilter === 'hub') {
      // Show all hubs, plus any polling stations that are actively connected
      const connectedPolling = pollingStations.filter(station =>
        liveConnectedCallsigns.has(station.callsign.toUpperCase())
      );
      return [...hubStations, ...connectedPolling];
    }

    // 'all' in live mode: only show polling stations that have been active in
    // the last 7 days, not every known station with coordinates.
    const allPolling: StationLocation[] = [];
    locations.forEach(loc => {
      if (!loc.latitude || !loc.longitude) return;
      if (normalizedHubCallsigns.has(loc.callsign.toUpperCase())) return;
      if (weekActiveStations.has(loc.callsign.toUpperCase())) {
        allPolling.push(loc);
      }
    });
    return [...hubStations, ...allPolling];
  }, [mode, stationFilter, locations, normalizedHubCallsigns, visibleReplayStations, hubStations, pollingStations, liveConnectedCallsigns, weekActiveStations]);

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
         : (hub.avgBitrate ?? 0);
      
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

  // Fetch polling stations that have been active in the last 7 days
  const fetchWeekActiveStations = useCallback(async () => {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('syslog_entries')
        .select('callsign, remote_callsign')
        .gte('timestamp', since)
        .limit(1000);

      if (error) {
        console.error('Error fetching week-active stations:', error);
        return;
      }

      const active = new Set<string>();
      const normalize = (c: string | null) => {
        if (!c) return null;
        return c.replace(/-\d+$/, '').toUpperCase();
      };

      data?.forEach(row => {
        const cs1 = normalize(row.callsign);
        const cs2 = normalize(row.remote_callsign);
        if (cs1) active.add(cs1);
        if (cs2) active.add(cs2);
      });

      setWeekActiveStations(active);
    } catch (err) {
      console.error('Error fetching week-active stations:', err);
    }
  }, []);

  useEffect(() => {
    if (!liveMode) return;
    fetchWeekActiveStations();
    const interval = setInterval(fetchWeekActiveStations, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [liveMode, fetchWeekActiveStations]);

  // ============================================================
  // REPLAY MODE: animate connections from DB as a time-lapse
  // ============================================================
  const handleReplayEvent = useCallback((ev: ReplayEvent) => {
    if (!mapReady || !mapRef.current || !replayLayerRef.current) return;
    setVisibleReplayStations(prev => {
      const next = new Set(prev);
      next.add(ev.station1.toUpperCase());
      next.add(ev.station2.toUpperCase());
      return next;
    });
    const loc1 = allStationsLookup[ev.station1];
    const loc2 = allStationsLookup[ev.station2];
    if (!loc1 || !loc2) {
      // Trigger background lookup for unknown stations
      if (lookupCallsigns) {
        const missing = [ev.station1, ev.station2].filter(c => !locations.has(c));
        if (missing.length) lookupCallsigns(missing);
      }
      return;
    }

    // Only one event visible at a time — clear previous replay layers first
    replayLayerRef.current?.clearLayers();
    mapRef.current?.closePopup();

    const lineColor = ev.snr !== null ? getSnrColor(ev.snr) : '#a855f7';
    const arc = getGreatCirclePoints(
      loc1.latitude!, loc1.longitude!,
      loc2.latitude!, loc2.longitude!,
      40
    );

    const polyline = L.polyline(arc, {
      color: lineColor,
      weight: 3,
      opacity: 0.95,
      lineCap: 'round',
      dashArray: '8, 8',
      className: 'replay-arc',
    });
    replayLayerRef.current!.addLayer(polyline);

    // Accumulate stats
    const key = [ev.station1, ev.station2].sort().join('↔');
    const distance = distances.get(key);
    const s = replayStatsRef.current;
    s.count += 1;
    if (ev.snr !== null && !isNaN(ev.snr)) { s.snrSum += ev.snr; s.snrCount += 1; }
    if (distance !== undefined && distance !== null) { s.distSum += distance; s.distCount += 1; }
    setReplayStats({
      count: s.count,
      avgSnr: s.snrCount ? s.snrSum / s.snrCount : null,
      avgDistance: s.distCount ? s.distSum / s.distCount : null,
    });

    const snrLine = ev.snr !== null
      ? `<div>S/N: <b style="color:${lineColor}">${ev.snr.toFixed(1)} dB</b></div>`
      : '';
    const distLine = distance
      ? `<div>Distance: <b>${distance.toLocaleString()} mi</b></div>`
      : '';

    let calloutLatLng: L.LatLngExpression = [loc1.latitude!, loc1.longitude!];
    let calloutAnchor: L.PointExpression = [0, 0];
    let calloutDirection = 'right';
    const map = mapRef.current!;
    try {
      const p1 = map.latLngToContainerPoint([loc1.latitude!, loc1.longitude!]);
      const p2 = map.latLngToContainerPoint([loc2.latitude!, loc2.longitude!]);
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const boxWidth = 190;
      const boxHeight = 92;
      const gap = 22;
      let chosenPoint = p1;

      if (Math.abs(dx) >= Math.abs(dy)) {
        const leftPoint = p1.x <= p2.x ? p1 : p2;
        const rightPoint = p1.x <= p2.x ? p2 : p1;
        const mapWidth = map.getSize().x;
        const useLeftPoint = leftPoint.x >= boxWidth + gap + 12 || rightPoint.x > mapWidth - boxWidth - gap - 12;
        chosenPoint = useLeftPoint ? leftPoint : rightPoint;
        calloutDirection = useLeftPoint ? 'right' : 'left';
        calloutAnchor = calloutDirection === 'right'
          ? [boxWidth + gap, boxHeight / 2]
          : [-gap, boxHeight / 2];
      } else {
        const topPoint = p1.y <= p2.y ? p1 : p2;
        const bottomPoint = p1.y <= p2.y ? p2 : p1;
        const mapHeight = map.getSize().y;
        const useTopPoint = topPoint.y >= boxHeight + gap + 12 || bottomPoint.y > mapHeight - boxHeight - gap - 12;
        chosenPoint = useTopPoint ? topPoint : bottomPoint;
        calloutDirection = useTopPoint ? 'down' : 'up';
        calloutAnchor = calloutDirection === 'down'
          ? [boxWidth / 2, boxHeight + gap]
          : [boxWidth / 2, -gap];
      }
      calloutLatLng = map.containerPointToLatLng(chosenPoint);
    } catch {}

    const callout = L.marker(calloutLatLng, {
      interactive: false,
      pane: 'popupPane',
      icon: L.divIcon({
        className: 'replay-callout',
        iconSize: [190, 92],
        iconAnchor: calloutAnchor,
        html: `
        <div class="replay-callout-box replay-callout-point-${calloutDirection}">
          <div style="font-weight:600;font-size:13px;margin-bottom:2px;">
            ${ev.station1} ↔ ${ev.station2}
          </div>
          ${distLine}
          ${snrLine}
          <div style="opacity:0.75;font-size:10px;margin-top:3px;">
            ${format(ev.timestamp, 'MMM d HH:mm:ss')}Z
          </div>
        </div>
      `,
      }),
    });

    replayLayerRef.current!.addLayer(callout);
  }, [mapReady, allStationsLookup, distances, lookupCallsigns, locations]);

  const replayStartDate = replayStart ? new Date(replayStart) : null;
  const replayEndDate = replayEnd ? new Date(replayEnd) : null;

  const replay = useReplayPlayer({
    start: mode === 'replay' ? replayStartDate : null,
    end: mode === 'replay' ? replayEndDate : null,
    eventsPerSecond: replaySpeed,
    onEvent: handleReplayEvent,
  });

  // Clear replay layer when leaving replay mode; reset stats
  useEffect(() => {
    if (mode !== 'replay' && replayLayerRef.current) {
      replayLayerRef.current.clearLayers();
      mapRef.current?.closePopup();
      resetReplayStats();
      setVisibleReplayStations(new Set());
    }
  }, [mode, resetReplayStats]);

  useEffect(() => {
    setVisibleReplayStations(new Set());
  }, [replayStart, replayEnd]);

  // When entering replay mode, default to showing all stations so the whole
  // network is visible during playback.
  const lastModeRef = useRef<MapMode>(mode);
  useEffect(() => {
    if (lastModeRef.current !== mode && mode === 'replay' && stationFilter !== 'all') {
      setStationFilter('all');
    }
    lastModeRef.current = mode;
  }, [mode, stationFilter, setStationFilter]);




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
        scrollWheelZoom: false, // Disable scroll wheel zoom to prevent accidental zooming
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(mapRef.current);

      markersRef.current = L.layerGroup().addTo(mapRef.current);
      connectionsRef.current = L.layerGroup().addTo(mapRef.current);
      liveConnectionsRef.current = L.layerGroup().addTo(mapRef.current);
      replayLayerRef.current = L.layerGroup().addTo(mapRef.current);

      setMapReady(true);
      (window as any).__map__ = mapRef.current;






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

      const dashedLine = L.polyline(arcCoords, { 
        color: '#22c55e', // Green to match live station color
        weight: 2,
        opacity: 0.9,
        dashArray: '6, 6',
        lineCap: 'butt',
        lineJoin: 'round',
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
          {/* Mode toggle: single button switches between Live and Replay */}
          <Button
            variant="default"
            size="sm"
            onClick={() => setMode(mode === 'live' ? 'replay' : 'live')}
            className={`gap-1.5 ${mode === 'live' ? 'bg-green-500 hover:bg-green-600' : 'bg-purple-500 hover:bg-purple-600'} text-white`}
            title={mode === 'live' ? 'Click to switch to Replay Mode' : 'Click to switch to Live Mode'}
          >
            {mode === 'live' ? (
              <>
                <Zap className="h-3.5 w-3.5" />
                Live Mode
              </>
            ) : (
              <>
                <Clock className="h-3.5 w-3.5" />
                Replay Mode
              </>
            )}
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

          <div className="ml-auto flex items-center gap-2">
            {/* Share button - only in fullscreen mode */}
            {isFullscreen && (
              <Button
                variant="outline"
                size="sm"
                onClick={urlState.copyShareableUrl}
                className="gap-1.5"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share Map
              </Button>
            )}
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

        {/* Replay panel */}
        {mode === 'replay' && (
          <div className="mt-3">
            <ReplayControls
              startISO={replayStart}
              endISO={replayEnd}
              speed={replaySpeed}
              playing={replay.playing}
              loading={replay.loading}
              eventCount={replay.events.length}
              emittedCount={replay.emittedCount}
              progress={replay.progress}
              onChangeRange={(s, e) => { replay.reset(); resetReplayStats(); setReplayRange(s, e); }}
              onChangeSpeed={setReplaySpeed}
              onPlay={() => { resetReplayStats(); replayLayerRef.current?.clearLayers(); mapRef.current?.closePopup(); replay.play(); }}
              onPause={replay.pause}
              onReset={() => {
                replay.reset();
                replayLayerRef.current?.clearLayers();
                mapRef.current?.closePopup();
                resetReplayStats();
              }}
            />

            {replay.error && (
              <p className="text-xs text-destructive mt-2">{replay.error}</p>
            )}
          </div>
        )}


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

            {/* Replay elapsed timer + speed overlay (upper-right) */}
            {mode === 'replay' && (replay.playing || replay.elapsedMs > 0) && (
              <div className="absolute top-3 right-3 z-[500] pointer-events-auto">
                <div className="bg-black/75 text-white rounded-md px-3 py-1.5 font-mono text-sm shadow-lg border border-purple-500/50 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-purple-300" />
                  <span>
                    {(() => {
                      const total = Math.floor(replay.elapsedMs / 1000);
                      const m = Math.floor(total / 60);
                      const s = total % 60;
                      const ms = Math.floor((replay.elapsedMs % 1000) / 100);
                      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
                    })()}
                  </span>
                  <span className="text-[10px] text-purple-200 opacity-80">
                    {replay.emittedCount}/{replay.events.length}
                  </span>
                  <div className="w-px h-4 bg-white/20 mx-1" />
                  <button
                    onClick={() => {
                      const speeds = [0.5, 1, 2, 4];
                      const idx = speeds.indexOf(replaySpeed);
                      if (idx > 0) setReplaySpeed(speeds[idx - 1]);
                    }}
                    disabled={replaySpeed <= 0.5}
                    className="pointer-events-auto p-0.5 rounded hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    title="Slower"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="text-xs text-purple-200 min-w-[2ch] text-center">{replaySpeed}×</span>
                  <button
                    onClick={() => {
                      const speeds = [0.5, 1, 2, 4];
                      const idx = speeds.indexOf(replaySpeed);
                      if (idx < speeds.length - 1) setReplaySpeed(speeds[idx + 1]);
                    }}
                    disabled={replaySpeed >= 4}
                    className="pointer-events-auto p-0.5 rounded hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    title="Faster"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Replay end-of-playback stats summary */}
            {mode === 'replay' && replay.done && replayStats.count > 0 && (
              <div className="absolute top-14 right-3 z-[500] max-w-xs animate-fade-in">
                <div className="bg-black/85 text-white rounded-lg px-4 py-3 shadow-xl border border-purple-500/60">
                  <div className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Replay Complete
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between gap-6">
                      <span className="text-white/70">Total connections</span>
                      <span className="font-mono font-semibold">{replayStats.count.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-white/70">Avg S/N</span>
                      <span className="font-mono font-semibold">
                        {replayStats.avgSnr !== null ? `${replayStats.avgSnr.toFixed(1)} dB` : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-white/70">Avg distance</span>
                      <span className="font-mono font-semibold">
                        {replayStats.avgDistance !== null ? `${Math.round(replayStats.avgDistance).toLocaleString()} mi` : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-6 pt-1 border-t border-white/15 mt-1">
                      <span className="text-white/70">Elapsed</span>
                      <span className="font-mono font-semibold">
                        {(() => {
                          const total = Math.floor(replay.elapsedMs / 1000);
                          const m = Math.floor(total / 60);
                          const s = total % 60;
                          return `${m}m ${s}s`;
                        })()}
                      </span>
                    </div>
                  </div>
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
