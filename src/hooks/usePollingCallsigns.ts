import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Filters the active stations set (from useDatabaseData) to only include
 * non-hub callsigns that have valid coordinates in station_locations.
 * This ensures the polling list matches exactly what the map displays.
 */
export function usePollingCallsigns(hubCallsigns: string[], activeStations?: Set<string>) {
  const [validCallsigns, setValidCallsigns] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const hubSet = useMemo(
    () => new Set(hubCallsigns.map(c => c.toUpperCase().replace(/-\d+$/, ''))),
    [hubCallsigns]
  );

  useEffect(() => {
    const fetchValidLocations = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('station_locations')
          .select('callsign')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null);

        if (error) throw error;

        setValidCallsigns(
          new Set((data || []).map(r => r.callsign.toUpperCase()))
        );
      } catch (err) {
        console.error('Error fetching valid station locations:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchValidLocations();
  }, []);

  const pollingCallsigns = useMemo(() => {
    if (!activeStations || activeStations.size === 0) return [];
    return Array.from(activeStations).filter(c => !hubSet.has(c) && validCallsigns.has(c)).sort();
  }, [activeStations, hubSet, validCallsigns]);

  return { pollingCallsigns, loading };
}
