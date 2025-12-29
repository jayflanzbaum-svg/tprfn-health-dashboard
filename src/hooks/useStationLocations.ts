import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StationLocation {
  id: string;
  callsign: string;
  latitude: number | null;
  longitude: number | null;
  grid_square: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  source: string;
  is_manual_override: boolean;
  last_fetched_at: string | null;
}

interface UseStationLocationsResult {
  locations: Map<string, StationLocation>;
  distances: Map<string, number>;
  loading: boolean;
  error: string | null;
  lookupCallsigns: (callsigns: string[]) => Promise<void>;
  updateLocation: (callsign: string, data: Partial<StationLocation>) => Promise<void>;
  getDistance: (callsign1: string, callsign2: string) => number | null;
}

export function useStationLocations(): UseStationLocationsResult {
  const [locations, setLocations] = useState<Map<string, StationLocation>>(new Map());
  const [distances, setDistances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load cached locations from database on mount
  useEffect(() => {
    const loadCached = async () => {
      try {
        const { data, error } = await supabase
          .from('station_locations')
          .select('*');
        
        if (error) throw error;
        
        const locMap = new Map<string, StationLocation>();
        (data || []).forEach(loc => {
          locMap.set(loc.callsign, loc as StationLocation);
        });
        setLocations(locMap);
      } catch (err) {
        console.error('Error loading cached locations:', err);
      }
    };
    
    loadCached();
  }, []);

  const lookupCallsigns = useCallback(async (callsigns: string[]) => {
    if (callsigns.length === 0) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const newLocations = new Map(locations);
      const newDistances = new Map(distances);
      
      // Batch requests into chunks of 50 (edge function limit)
      const BATCH_SIZE = 50;
      const batches: string[][] = [];
      for (let i = 0; i < callsigns.length; i += BATCH_SIZE) {
        batches.push(callsigns.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`Looking up ${callsigns.length} callsigns in ${batches.length} batch(es)`);
      
      for (const batch of batches) {
        const { data, error } = await supabase.functions.invoke('lookup-callsign', {
          body: { callsigns: batch }
        });

        if (error) throw error;

        // Update locations from this batch
        Object.entries(data.locations || {}).forEach(([callsign, loc]) => {
          newLocations.set(callsign, loc as StationLocation);
        });

        // Update distances from this batch
        Object.entries(data.distances || {}).forEach(([key, dist]) => {
          newDistances.set(key, dist as number);
        });
      }
      
      setLocations(newLocations);
      setDistances(newDistances);
    } catch (err: any) {
      console.error('Error looking up callsigns:', err);
      setError(err.message || 'Failed to lookup callsigns');
    } finally {
      setLoading(false);
    }
  }, [locations, distances]);

  const updateLocation = useCallback(async (callsign: string, data: Partial<StationLocation>) => {
    try {
      const upper = callsign.toUpperCase();
      const existing = locations.get(upper);
      
      const updateData = {
        callsign: upper,
        ...data,
        is_manual_override: true,
        source: 'manual',
      };

      const { data: updated, error } = await supabase
        .from('station_locations')
        .upsert(updateData, { onConflict: 'callsign' })
        .select()
        .single();

      if (error) throw error;

      const newLocations = new Map(locations);
      newLocations.set(upper, updated as StationLocation);
      setLocations(newLocations);

      // Recalculate distances for this callsign
      if (updated.latitude && updated.longitude) {
        const newDistances = new Map(distances);
        locations.forEach((loc, otherCallsign) => {
          if (otherCallsign !== upper && loc.latitude && loc.longitude) {
            const dist = calculateDistance(
              updated.latitude, updated.longitude,
              loc.latitude, loc.longitude
            );
            const key = [upper, otherCallsign].sort().join('↔');
            newDistances.set(key, Math.round(dist));
          }
        });
        setDistances(newDistances);
      }
    } catch (err: any) {
      console.error('Error updating location:', err);
      throw err;
    }
  }, [locations, distances]);

  const getDistance = useCallback((callsign1: string, callsign2: string): number | null => {
    const key = [callsign1.toUpperCase(), callsign2.toUpperCase()].sort().join('↔');
    return distances.get(key) ?? null;
  }, [distances]);

  return {
    locations,
    distances,
    loading,
    error,
    lookupCallsigns,
    updateLocation,
    getDistance,
  };
}

// Haversine formula for distance calculation
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
