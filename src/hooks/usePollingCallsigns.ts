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
        // Fetch distinct callsigns from syslog_entries
        // We need both callsign and remote_callsign fields
        const uniqueCallsigns = new Set<string>();
        const PAGE_SIZE = 1000;

        // Fetch distinct callsigns
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from('syslog_entries')
            .select('callsign')
            .range(offset, offset + PAGE_SIZE - 1);
          if (error) throw error;
          (data || []).forEach(r => {
            const normalized = r.callsign.toUpperCase().replace(/-\d+$/, '');
            if (normalized) uniqueCallsigns.add(normalized);
          });
          hasMore = data && data.length === PAGE_SIZE;
          offset += PAGE_SIZE;
        }

        // Fetch distinct remote_callsigns
        offset = 0;
        hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from('syslog_entries')
            .select('remote_callsign')
            .not('remote_callsign', 'is', null)
            .range(offset, offset + PAGE_SIZE - 1);
          if (error) throw error;
          (data || []).forEach(r => {
            if (r.remote_callsign) {
              const normalized = r.remote_callsign.toUpperCase().replace(/-\d+$/, '');
              if (normalized) uniqueCallsigns.add(normalized);
            }
          });
          hasMore = data && data.length === PAGE_SIZE;
          offset += PAGE_SIZE;
        }

        setAllCallsigns(Array.from(uniqueCallsigns).sort());
      } catch (err) {
        console.error('Error fetching polling callsigns:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCallsigns();
  }, []);

  // Filter out hub callsigns to get polling-only
  const pollingCallsigns = useMemo(() => {
    return allCallsigns.filter(c => !hubSet.has(c));
  }, [allCallsigns, hubSet]);

  return { pollingCallsigns, loading };
}
