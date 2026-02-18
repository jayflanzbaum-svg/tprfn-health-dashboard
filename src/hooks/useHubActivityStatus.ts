import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface HubActivityStatus {
  loading: boolean;
  allActive: boolean;
  activeCount: number;
  totalCount: number;
}

export function useHubActivityStatus(allowedCallsigns: string[]): HubActivityStatus {
  const [status, setStatus] = useState<HubActivityStatus>({
    loading: true,
    allActive: false,
    activeCount: 0,
    totalCount: allowedCallsigns.length,
  });

  useEffect(() => {
    const fetchActivity = async () => {
      if (allowedCallsigns.length === 0) {
        setStatus({ loading: false, allActive: true, activeCount: 0, totalCount: 0 });
        return;
      }

      try {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        // Build OR filter for callsigns to avoid hitting the 1000-row default limit
        const callsignFilters = allowedCallsigns.map(c => 
          `callsign.eq.${c},remote_callsign.eq.${c}`
        ).join(',');
        
        const { data: entries, error } = await supabase
          .from('syslog_entries')
          .select('callsign, remote_callsign')
          .gte('timestamp', twentyFourHoursAgo.toISOString())
          .in('event_type', ['connect_in', 'connect_out', 'sn_report'])
          .or(callsignFilters)
          .limit(5000);

        if (error) {
          console.error('Error fetching activity status:', error);
          setStatus({ loading: false, allActive: false, activeCount: 0, totalCount: allowedCallsigns.length });
          return;
        }

        const activeStations = new Set<string>();
        const allowedSet = new Set(allowedCallsigns.map(c => c.toUpperCase().trim()));

        for (const entry of entries || []) {
          const station = entry.callsign?.toUpperCase().trim() || '';
          const partner = entry.remote_callsign?.toUpperCase().trim() || '';
          
          if (allowedSet.has(station)) activeStations.add(station);
          if (partner && allowedSet.has(partner)) activeStations.add(partner);
        }

        setStatus({
          loading: false,
          allActive: activeStations.size === allowedCallsigns.length,
          activeCount: activeStations.size,
          totalCount: allowedCallsigns.length,
        });
      } catch (err) {
        console.error('Error in useHubActivityStatus:', err);
        setStatus({ loading: false, allActive: false, activeCount: 0, totalCount: allowedCallsigns.length });
      }
    };

    fetchActivity();
    const interval = setInterval(fetchActivity, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [allowedCallsigns]);

  return status;
}
