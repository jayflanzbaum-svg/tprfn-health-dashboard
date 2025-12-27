import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HamQTHResponse {
  session?: {
    session_id?: string;
    error?: string;
  };
  search?: {
    callsign?: string;
    nick?: string;
    qth?: string;
    country?: string;
    adif?: string;
    itu?: string;
    cq?: string;
    grid?: string;
    adr_name?: string;
    adr_street1?: string;
    adr_city?: string;
    adr_zip?: string;
    adr_country?: string;
    adr_adif?: string;
    us_state?: string;
    latitude?: string;
    longitude?: string;
    error?: string;
  };
}

// Calculate distance between two points using Haversine formula
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

// Convert Maidenhead grid square to lat/long
function gridToLatLon(grid: string): { lat: number; lon: number } | null {
  if (!grid || grid.length < 4) return null;
  
  const g = grid.toUpperCase();
  const lon = (g.charCodeAt(0) - 65) * 20 - 180;
  const lat = (g.charCodeAt(1) - 65) * 10 - 90;
  const lonMin = parseInt(g[2]) * 2;
  const latMin = parseInt(g[3]);
  
  let finalLon = lon + lonMin + 1; // Center of grid
  let finalLat = lat + latMin + 0.5;
  
  if (grid.length >= 6) {
    const lonSec = (g.charCodeAt(4) - 65) * (5/60);
    const latSec = (g.charCodeAt(5) - 65) * (2.5/60);
    finalLon = lon + lonMin + lonSec + (2.5/60);
    finalLat = lat + latMin + latSec + (1.25/60);
  }
  
  return { lat: finalLat, lon: finalLon };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { callsigns, forceRefresh = false } = await req.json();
    
    if (!callsigns || !Array.isArray(callsigns) || callsigns.length === 0) {
      return new Response(
        JSON.stringify({ error: 'callsigns array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limit to prevent abuse
    if (callsigns.length > 50) {
      return new Response(
        JSON.stringify({ error: 'Maximum 50 callsigns per request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Looking up ${callsigns.length} callsigns, forceRefresh: ${forceRefresh}`);

    // Check what we already have in the database
    const { data: existingLocations, error: fetchError } = await supabase
      .from('station_locations')
      .select('*')
      .in('callsign', callsigns.map((c: string) => c.toUpperCase()));

    if (fetchError) {
      console.error('Error fetching existing locations:', fetchError);
      throw fetchError;
    }

    const existingMap = new Map(
      (existingLocations || []).map(loc => [loc.callsign, loc])
    );

    const results: Record<string, any> = {};
    const toFetch: string[] = [];

    // Determine which callsigns need fetching
    for (const callsign of callsigns) {
      const upper = callsign.toUpperCase();
      const existing = existingMap.get(upper);
      
      if (existing) {
        // If manual override, always use it
        if (existing.is_manual_override) {
          results[upper] = existing;
          continue;
        }
        
        // If not forcing refresh and we have recent data (< 30 days), use cached
        if (!forceRefresh && existing.last_fetched_at) {
          const fetchedAt = new Date(existing.last_fetched_at);
          const daysSinceFetch = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceFetch < 30 && existing.latitude) {
            results[upper] = existing;
            continue;
          }
        }
      }
      
      toFetch.push(upper);
    }

    console.log(`Found ${Object.keys(results).length} cached, need to fetch ${toFetch.length}`);

    // Fetch from HamQTH for missing callsigns
    for (const callsign of toFetch) {
      try {
        // HamQTH free API (no auth required for basic lookups)
        const url = `https://www.hamqth.com/xml.php?callsign=${encodeURIComponent(callsign)}&prg=varahf-dashboard`;
        console.log(`Fetching from HamQTH: ${callsign}`);
        
        const response = await fetch(url);
        const text = await response.text();
        
        // Parse XML response (simple parsing for the fields we need)
        const getField = (field: string): string | null => {
          const match = text.match(new RegExp(`<${field}>([^<]*)</${field}>`));
          return match ? match[1] : null;
        };

        const latitude = getField('latitude');
        const longitude = getField('longitude');
        const grid = getField('grid');
        const city = getField('adr_city');
        const state = getField('us_state');
        const country = getField('adr_country') || getField('country');
        const address = getField('adr_street1');

        let lat = latitude ? parseFloat(latitude) : null;
        let lon = longitude ? parseFloat(longitude) : null;

        // If no lat/lon but we have grid, calculate from grid
        if ((!lat || !lon) && grid) {
          const coords = gridToLatLon(grid);
          if (coords) {
            lat = coords.lat;
            lon = coords.lon;
          }
        }

        const locationData = {
          callsign,
          latitude: lat,
          longitude: lon,
          grid_square: grid,
          city,
          state,
          country,
          address,
          source: 'hamqth',
          is_manual_override: false,
          last_fetched_at: new Date().toISOString(),
        };

        // Upsert to database
        const { data: upserted, error: upsertError } = await supabase
          .from('station_locations')
          .upsert(locationData, { onConflict: 'callsign' })
          .select()
          .single();

        if (upsertError) {
          console.error(`Error upserting ${callsign}:`, upsertError);
        } else {
          results[callsign] = upserted;
        }

        // Rate limit: wait 500ms between requests to be nice to HamQTH
        if (toFetch.indexOf(callsign) < toFetch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        console.error(`Error fetching ${callsign}:`, err);
        results[callsign] = { callsign, error: 'Failed to fetch' };
      }
    }

    // Calculate distances between all pairs
    const distances: Record<string, number> = {};
    const callsignList = Object.keys(results);
    
    for (let i = 0; i < callsignList.length; i++) {
      for (let j = i + 1; j < callsignList.length; j++) {
        const c1 = callsignList[i];
        const c2 = callsignList[j];
        const loc1 = results[c1];
        const loc2 = results[c2];
        
        if (loc1?.latitude && loc1?.longitude && loc2?.latitude && loc2?.longitude) {
          const dist = calculateDistance(
            loc1.latitude, loc1.longitude,
            loc2.latitude, loc2.longitude
          );
          const key = [c1, c2].sort().join('↔');
          distances[key] = Math.round(dist);
        }
      }
    }

    console.log(`Returning ${Object.keys(results).length} locations and ${Object.keys(distances).length} distances`);

    return new Response(
      JSON.stringify({ locations: results, distances }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in lookup-callsign:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
