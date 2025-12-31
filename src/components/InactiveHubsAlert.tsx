import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConnectRecord, SNRecord } from '@/lib/syslogParser';

interface InactiveHubsAlertProps {
  connectRecords: ConnectRecord[];
  snRecords: SNRecord[];
  allowedCallsigns: string[];
}

export function InactiveHubsAlert({ connectRecords, snRecords, allowedCallsigns }: InactiveHubsAlertProps) {
  const inactiveStations = useMemo(() => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Build a map of each station's last activity time
    const lastActivityMap = new Map<string, Date>();
    
    // Check connect records
    connectRecords.forEach(record => {
      const station = record.station.toUpperCase();
      const partner = record.partner.toUpperCase();
      
      const existingStation = lastActivityMap.get(station);
      if (!existingStation || record.timestamp > existingStation) {
        lastActivityMap.set(station, record.timestamp);
      }
      
      const existingPartner = lastActivityMap.get(partner);
      if (!existingPartner || record.timestamp > existingPartner) {
        lastActivityMap.set(partner, record.timestamp);
      }
    });
    
    // Also check S/N records for activity
    snRecords.forEach(record => {
      const station = record.station.toUpperCase();
      const partner = record.partner.toUpperCase();
      
      const existingStation = lastActivityMap.get(station);
      if (!existingStation || record.timestamp > existingStation) {
        lastActivityMap.set(station, record.timestamp);
      }
      
      const existingPartner = lastActivityMap.get(partner);
      if (!existingPartner || record.timestamp > existingPartner) {
        lastActivityMap.set(partner, record.timestamp);
      }
    });
    
    // Find stations that haven't connected in 24 hours
    const inactive: Array<{ callsign: string; lastSeen: Date | null }> = [];
    
    allowedCallsigns.forEach(callsign => {
      const normalized = callsign.toUpperCase().trim();
      const lastActivity = lastActivityMap.get(normalized);
      
      if (!lastActivity || lastActivity < twentyFourHoursAgo) {
        inactive.push({
          callsign: normalized,
          lastSeen: lastActivity || null,
        });
      }
    });
    
    // Sort by last seen (null/oldest first)
    inactive.sort((a, b) => {
      if (!a.lastSeen && !b.lastSeen) return 0;
      if (!a.lastSeen) return -1;
      if (!b.lastSeen) return 1;
      return a.lastSeen.getTime() - b.lastSeen.getTime();
    });
    
    return inactive;
  }, [connectRecords, snRecords, allowedCallsigns]);

  const formatLastSeen = (date: Date | null) => {
    if (!date) return 'Never seen';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays}d ${diffHours % 24}h ago`;
    }
    return `${diffHours}h ago`;
  };

  // All stations active - show success state
  if (inactiveStations.length === 0) {
    return (
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-3 py-2 rounded-md">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span>All {allowedCallsigns.length} hub stations active in last 24 hours</span>
      </div>
    );
  }

  return (
    <Alert variant="destructive" className="mb-6 border-destructive/50 bg-destructive/10">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="font-semibold">
        Inactive Hub Stations ({inactiveStations.length})
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm text-muted-foreground mb-2">
          The following stations have not connected to another hub in the last 24 hours:
        </p>
        <div className="flex flex-wrap gap-2">
          {inactiveStations.map(({ callsign, lastSeen }) => (
            <span
              key={callsign}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-destructive/20 text-destructive-foreground text-sm font-mono"
              title={lastSeen ? `Last seen: ${lastSeen.toLocaleString()}` : 'Never seen in data'}
            >
              {callsign}
              <span className="text-xs opacity-70">({formatLastSeen(lastSeen)})</span>
            </span>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
