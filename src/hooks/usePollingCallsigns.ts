import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const MANUAL_POLLING_KEY = 'manual_polling_stations';

function loadManualStations(): Set<string> {
  try {
    const stored = localStorage.getItem(MANUAL_POLLING_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveManualStations(stations: Set<string>) {
  localStorage.setItem(MANUAL_POLLING_KEY, JSON.stringify(Array.from(stations)));
}

/**
 * Filters the active stations set (from useDatabaseData) to only include
 * non-hub callsigns that have valid coordinates in station_locations.
 * Also supports manually adding stations that persist across sessions.
 */
export function usePollingCallsigns(hubCallsigns: string[], activeStations?: Set<string>) {
  const [validCallsigns, setValidCallsigns] = useState<Set<string>>(new Set());
  const [manuallyAdded, setManuallyAdded] = useState<Set<string>>(loadManualStations);
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
    const upper = callsign.toUpperCase();
    setManuallyAdded(prev => {
      const next = new Set(prev).add(upper);
      saveManualStations(next);
      return next;
    });
    setValidCallsigns(prev => new Set(prev).add(upper));
  }, []);

  const pollingCallsigns = useMemo(() => {
    const base = new Set<string>();
    // Normalize all active stations to uppercase
    if (activeStations) {
      activeStations.forEach(c => base.add(c.toUpperCase()));
    }
    // Merge in manually added stations (persisted in localStorage)
    manuallyAdded.forEach(c => base.add(c));
    return Array.from(base).filter(c => !hubSet.has(c) && validCallsigns.has(c)).sort();
  }, [activeStations, hubSet, validCallsigns, manuallyAdded]);

  return { pollingCallsigns, loading, addPollingStation };
}
