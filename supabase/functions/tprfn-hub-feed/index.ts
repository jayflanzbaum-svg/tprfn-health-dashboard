import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { normalizeHubFrequency, type HubFrequency } from '../_shared/hubFrequency.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const hubs = [];
    for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('hub_profiles')
      .select('full_callsign, base_callsign, ssid, operator, network, city, state, country, latitude, longitude, frequencies, notes, scan_times, last_heard_at, updated_at')
      .eq('is_active', true)
      .order('full_callsign')
      .range(offset, offset + 999);

    if (error) throw error;

    hubs.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    }
    const now = Date.now();

    const enriched = hubs.map((h: any) => {
      const { last_heard_at, ...rest } = h;
      const seen = last_heard_at ?? null;
      return {
        ...rest,
        frequencies: (h.frequencies ?? []).map((f: HubFrequency) => normalizeHubFrequency(f)),
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
