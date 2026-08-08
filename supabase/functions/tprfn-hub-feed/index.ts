import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await supabase
      .from('hub_profiles')
      .select('full_callsign, base_callsign, ssid, operator, network, city, state, country, latitude, longitude, frequencies, notes, updated_at')
      .order('full_callsign');

    if (error) throw error;

    const hubs = data ?? [];
    const bases = [...new Set(hubs.map((h: any) => String(h.base_callsign).toUpperCase()))];
    const now = Date.now();
    const lastHeard: Record<string, string> = {};

    if (bases.length) {
      const { data: up } = await supabase.rpc('hub_uptime_days', {
        p_hubs: bases,
        p_start: new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString(),
        p_end: new Date(now).toISOString(),
      });
      for (const r of (up ?? []) as any[]) {
        if (r.last_seen) lastHeard[String(r.callsign).toUpperCase()] = r.last_seen;
      }
    }

    const enriched = hubs.map((h: any) => {
      const seen = lastHeard[String(h.base_callsign).toUpperCase()] ?? null;
      return {
        ...h,
        last_heard: seen,
        online: seen ? now - new Date(seen).getTime() < 24 * 60 * 60 * 1000 : false,
      };
    });

    const payload = {
      generated_at: new Date().toISOString(),
      online_window_hours: 24,
      count: enriched.length,
      hubs: enriched,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
