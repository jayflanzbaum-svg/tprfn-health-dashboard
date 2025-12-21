export interface SNRecord {
  timestamp: Date;
  station: string;
  partner: string;
  snValue: number;
  direction: 'outgoing' | 'incoming';
}

export interface ConnectRecord {
  timestamp: Date;
  station: string;
  partner: string;
  varaVersion: string;
}

export interface DisconnectRecord {
  timestamp: Date;
  station: string;
  partner: string;
  txBytes: number;
  rxBytes: number;
  maxTxBps: number;
  maxRxBps: number;
  sessionTime: string;
  sessionSeconds: number;
  disconnectType: 'normal' | 'timeout' | 'command';
}

export interface HubConnection {
  station1: string;
  station2: string;
  connectionId: string;
  snRecords: SNRecord[];
  connectRecords: ConnectRecord[];
  disconnectRecords: DisconnectRecord[];
  avgSN: number;
  totalTxBytes: number;
  totalRxBytes: number;
  sessionCount: number;
}

export interface ParsedData {
  snRecords: SNRecord[];
  connectRecords: ConnectRecord[];
  disconnectRecords: DisconnectRecord[];
  hubConnections: Map<string, HubConnection>;
  stations: Set<string>;
  dateRange: { start: Date; end: Date };
}

function parseTimestamp(dateStr: string): Date {
  // Format: "Dec 12 00:00:32"
  const year = new Date().getFullYear();
  const parsed = new Date(`${dateStr} ${year}`);
  return parsed;
}

function parseSessionTime(timeStr: string): number {
  // Format: "00:17" (mm:ss) or "04:06" etc
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 0;
}

function extractStation(hostname: string): string {
  // H-KK4DIV-1 -> KK4DIV-1
  if (hostname.startsWith('H-')) {
    return hostname.substring(2);
  }
  return hostname;
}

function createConnectionId(station1: string, station2: string): string {
  // Sort alphabetically to ensure consistent ID regardless of direction
  const sorted = [station1, station2].sort();
  return `${sorted[0]}↔${sorted[1]}`;
}

export function formatCallsign(callsign: string): string {
  // Remove station number suffix for cleaner display (e.g., "KK4DIV-1" -> "KK4DIV")
  return callsign.replace(/-\d+$/, '');
}

export function formatConnectionShort(connectionId: string): string {
  // Convert "KK4DIV-1↔N4SFL-7" to "KK4DIV ↔ N4SFL" (NBSP prevents wrapping)
  const parts = connectionId.split('↔');
  if (parts.length === 2) {
    return `${formatCallsign(parts[0])}\u00A0↔\u00A0${formatCallsign(parts[1])}`;
  }
  return connectionId;
}

export function parseSyslog(content: string): ParsedData {
  const lines = content.split('\n');
  const snRecords: SNRecord[] = [];
  const connectRecords: ConnectRecord[] = [];
  const disconnectRecords: DisconnectRecord[] = [];
  const stations = new Set<string>();
  const hubConnections = new Map<string, HubConnection>();
  
  let minDate = new Date();
  let maxDate = new Date(0);

  // Regex patterns
  const snPattern = /^(\w+\s+\d+\s+\d+:\d+:\d+)\s+(H-[\w-]+)\s+VARAHF\s+([\w-]+)\s+Average\s+S\/N:\s+([-\d.]+)\s*dB/;
  const connectPattern = /^(\w+\s+\d+\s+\d+:\d+:\d+)\s+(H-[\w-]+)\s+VARAHF\s+Connected\s+to\s+([\w-]+)\s+VARA\s+HF\s+(v[\d.]+)/;
  const disconnectPattern = /^(\w+\s+\d+\s+\d+:\d+:\d+)\s+(H-[\w-]+)\s+VARAHF\s+Disconnected(?:\s+\((\w+)\))?\s+TX:\s+(\d+)\s+Bytes\s+\(Max:\s+(\d+)\s+bps\)\s+RX:\s+(\d+)\s+Bytes\s+\(Max:\s+(\d+)\s+bps\)\s+Session\s+Time:\s+(\d+:\d+)/;

  for (const line of lines) {
    // Parse S/N records
    const snMatch = line.match(snPattern);
    if (snMatch) {
      const timestamp = parseTimestamp(snMatch[1]);
      const station = extractStation(snMatch[2]);
      const partner = snMatch[3];
      const snValue = parseFloat(snMatch[4]);

      if (timestamp < minDate) minDate = timestamp;
      if (timestamp > maxDate) maxDate = timestamp;

      stations.add(station);
      stations.add(partner);

      const record: SNRecord = {
        timestamp,
        station,
        partner,
        snValue,
        direction: 'outgoing'
      };
      snRecords.push(record);

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

    // Parse Connected records
    const connectMatch = line.match(connectPattern);
    if (connectMatch) {
      const timestamp = parseTimestamp(connectMatch[1]);
      const station = extractStation(connectMatch[2]);
      const partner = connectMatch[3];
      const varaVersion = connectMatch[4];

      if (timestamp < minDate) minDate = timestamp;
      if (timestamp > maxDate) maxDate = timestamp;

      stations.add(station);
      stations.add(partner);

      const record: ConnectRecord = {
        timestamp,
        station,
        partner,
        varaVersion
      };
      connectRecords.push(record);

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

    // Parse Disconnect records
    const disconnectMatch = line.match(disconnectPattern);
    if (disconnectMatch) {
      const timestamp = parseTimestamp(disconnectMatch[1]);
      const station = extractStation(disconnectMatch[2]);
      const disconnectType = disconnectMatch[3]?.toLowerCase() === 'timeout' ? 'timeout' : 'normal';
      const txBytes = parseInt(disconnectMatch[4]);
      const maxTxBps = parseInt(disconnectMatch[5]);
      const rxBytes = parseInt(disconnectMatch[6]);
      const maxRxBps = parseInt(disconnectMatch[7]);
      const sessionTime = disconnectMatch[8];

      if (timestamp < minDate) minDate = timestamp;
      if (timestamp > maxDate) maxDate = timestamp;

      // Find the partner from the most recent S/N record for this station
      let partner = '';
      for (let i = snRecords.length - 1; i >= 0; i--) {
        if (snRecords[i].station === station && 
            Math.abs(snRecords[i].timestamp.getTime() - timestamp.getTime()) < 60000) {
          partner = snRecords[i].partner;
          break;
        }
      }

      if (!partner) continue; // Skip if we can't find the partner

      const record: DisconnectRecord = {
        timestamp,
        station,
        partner,
        txBytes,
        rxBytes,
        maxTxBps,
        maxRxBps,
        sessionTime,
        sessionSeconds: parseSessionTime(sessionTime),
        disconnectType
      };
      disconnectRecords.push(record);

      // Add to hub connection
      const connectionId = createConnectionId(station, partner);
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
}

export function getSignalQuality(snValue: number): 'excellent' | 'good' | 'fair' | 'poor' | 'bad' {
  if (snValue >= 10) return 'excellent';
  if (snValue >= 5) return 'good';
  if (snValue >= 0) return 'fair';
  if (snValue >= -10) return 'poor';
  return 'bad';
}

export function getSignalQualityLabel(quality: string): string {
  const labels: Record<string, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
    bad: 'Bad'
  };
  return labels[quality] || quality;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
