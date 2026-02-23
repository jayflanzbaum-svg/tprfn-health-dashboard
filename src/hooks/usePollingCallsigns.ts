import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches all unique callsigns from syslog_entries that are NOT in the hub callsigns list.
 * These are "polling" stations — remote stations that connect to hubs.
 */
export function usePollingCallsigns(hubCallsigns: string[]) {
  const [allCallsigns, setAllCallsigns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const hubSet = useMemo(
    () => new Set(hubCallsigns.map(c => c.toUpperCase().replace(/-\d+$/, ''))),
    [hubCallsigns]
  );

  useEffect(() => {
    const fetchCallsigns = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('distinct_syslog_callsigns');
        if (error) throw error;
        setAllCallsigns((data || []).map((r: { callsign: string }) => r.callsign).filter(Boolean));
      } catch (err) {
        console.error('Error fetching polling callsigns:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCallsigns();
  }, []);

  const pollingCallsigns = useMemo(() => {
    return allCallsigns.filter(c => !hubSet.has(c));
  }, [allCallsigns, hubSet]);

  return { pollingCallsigns, loading };
}
