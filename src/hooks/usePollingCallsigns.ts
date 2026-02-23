import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches all unique callsigns from syslog_entries that are NOT in the hub callsigns list,
 * AND that have been successfully looked up (exist in station_locations with valid coordinates).
 */
export function usePollingCallsigns(hubCallsigns: string[]) {
  const [allCallsigns, setAllCallsigns] = useState<string[]>([]);
  const [validCallsigns, setValidCallsigns] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const hubSet = useMemo(
    () => new Set(hubCallsigns.map(c => c.toUpperCase().replace(/-\d+$/, ''))),
    [hubCallsigns]
  );

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch discovered callsigns and validated locations in parallel
        const [callsignsResult, locationsResult] = await Promise.all([
          supabase.rpc('distinct_syslog_callsigns'),
          supabase
            .from('station_locations')
            .select('callsign')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null),
        ]);

        if (callsignsResult.error) throw callsignsResult.error;
        if (locationsResult.error) throw locationsResult.error;

        setAllCallsigns(
          (callsignsResult.data || []).map((r: { callsign: string }) => r.callsign).filter(Boolean)
        );
        setValidCallsigns(
          new Set((locationsResult.data || []).map(r => r.callsign.toUpperCase()))
        );
      } catch (err) {
        console.error('Error fetching polling callsigns:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const pollingCallsigns = useMemo(() => {
    return allCallsigns.filter(c => !hubSet.has(c) && validCallsigns.has(c));
  }, [allCallsigns, hubSet, validCallsigns]);

  return { pollingCallsigns, loading };
}
