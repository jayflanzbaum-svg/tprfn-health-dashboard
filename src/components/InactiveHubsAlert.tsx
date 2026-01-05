import { useMemo, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';

interface InactiveHubsAlertProps {
  allowedCallsigns: string[];
  showSuccessInHeader?: boolean;
}

interface StationActivity {
  callsign: string;
  lastSeen: Date | null;
}

export function InactiveHubsAlert({ allowedCallsigns, showSuccessInHeader = false }: InactiveHubsAlertProps) {
  const [inactiveStations, setInactiveStations] = useState<StationActivity[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch last 24 hours of activity directly from database (independent of date filter)
  useEffect(() => {
    const fetchLast24HoursActivity = async () => {
      if (allowedCallsigns.length === 0) {
        setInactiveStations([]);
        setLoading(false);
        return;
      }

      try {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        // Fetch all activity in the last 24 hours for allowed callsigns
        const { data: entries, error } = await supabase
          .from('syslog_entries')
          .select('callsign, remote_callsign, timestamp')
          .gte('timestamp', twentyFourHoursAgo.toISOString())
          .in('event_type', ['connect_in', 'connect_out', 'sn_report']);

        if (error) {
          console.error('Error fetching 24h activity:', error);
          setLoading(false);
          return;
        }

        // Build a map of each station's last activity time
        const lastActivityMap = new Map<string, Date>();
        const allowedSet = new Set(allowedCallsigns.map(c => c.toUpperCase().trim()));

        for (const entry of entries || []) {
          const station = entry.callsign?.toUpperCase().trim() || '';
          const partner = entry.remote_callsign?.toUpperCase().trim() || '';
          const timestamp = new Date(entry.timestamp);

          // Track activity for stations in our allowed list
          if (allowedSet.has(station)) {
            const existing = lastActivityMap.get(station);
            if (!existing || timestamp > existing) {
              lastActivityMap.set(station, timestamp);
            }
          }
          if (partner && allowedSet.has(partner)) {
            const existing = lastActivityMap.get(partner);
            if (!existing || timestamp > existing) {
              lastActivityMap.set(partner, timestamp);
            }
          }
        }

        // Find stations that haven't connected in 24 hours
        const inactive: StationActivity[] = [];
        
        for (const callsign of allowedCallsigns) {
          const normalized = callsign.toUpperCase().trim();
          const lastActivity = lastActivityMap.get(normalized);
          
          if (!lastActivity) {
            // Station not seen in last 24 hours - need to check if it has any activity at all
            inactive.push({
              callsign: normalized,
              lastSeen: null, // Will be updated below if we find historical data
            });
          }
        }

        // For inactive stations, fetch their most recent activity ever
        if (inactive.length > 0) {
          const inactiveCallsigns = inactive.map(s => s.callsign);
          
          // Fetch the most recent activity for each inactive station
          for (const callsign of inactiveCallsigns) {
            const { data: lastEntry } = await supabase
              .from('syslog_entries')
              .select('timestamp')
              .or(`callsign.eq.${callsign},remote_callsign.eq.${callsign}`)
              .in('event_type', ['connect_in', 'connect_out', 'sn_report'])
              .order('timestamp', { ascending: false })
              .limit(1);

            if (lastEntry && lastEntry.length > 0) {
              const station = inactive.find(s => s.callsign === callsign);
              if (station) {
                station.lastSeen = new Date(lastEntry[0].timestamp);
              }
            }
          }
        }

        // Sort by last seen (null/oldest first)
        inactive.sort((a, b) => {
          if (!a.lastSeen && !b.lastSeen) return 0;
          if (!a.lastSeen) return -1;
          if (!b.lastSeen) return 1;
          return a.lastSeen.getTime() - b.lastSeen.getTime();
        });

        setInactiveStations(inactive);
      } catch (err) {
        console.error('Error in InactiveHubsAlert:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLast24HoursActivity();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchLast24HoursActivity, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [allowedCallsigns]);

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

  // If loading or all active, don't render anything here (success shown in header)
  if (loading || inactiveStations.length === 0) {
    return null;
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
