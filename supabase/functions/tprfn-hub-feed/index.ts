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
      .select('full_callsign, base_callsign, ssid, operator, network, city, state, country, latitude, longitude, frequencies, notes, last_heard_at, updated_at')
      .order('full_callsign');

    if (error) throw error;

    const hubs = data ?? [];
    const now = Date.now();

    const enriched = hubs.map((h: any) => {
      const { last_heard_at, ...rest } = h;
      const seen = last_heard_at ?? null;
      return {
        ...rest,
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
