import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Filters the active stations set (from useDatabaseData) to only include
 * non-hub callsigns that have valid coordinates in station_locations.
 * Also supports manually adding stations that aren't in the active set.
 */
export function usePollingCallsigns(hubCallsigns: string[], activeStations?: Set<string>) {
  const [validCallsigns, setValidCallsigns] = useState<Set<string>>(new Set());
  const [manuallyAdded, setManuallyAdded] = useState<Set<string>>(new Set());
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

  const addPollingStation = useCallback((callsign: string) => {
    setManuallyAdded(prev => new Set(prev).add(callsign.toUpperCase()));
    // Also add to validCallsigns so it passes the filter
    setValidCallsigns(prev => new Set(prev).add(callsign.toUpperCase()));
  }, []);

  const pollingCallsigns = useMemo(() => {
    const base = activeStations ? new Set(activeStations) : new Set<string>();
    // Merge in manually added stations
    manuallyAdded.forEach(c => base.add(c));
    return Array.from(base).filter(c => !hubSet.has(c) && validCallsigns.has(c)).sort();
  }, [activeStations, hubSet, validCallsigns, manuallyAdded]);

  return { pollingCallsigns, loading, addPollingStation };
}
