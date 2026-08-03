const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const APP_ORIGIN = 'https://tprfn-health-dashboard.lovable.app';
const ALLOWED_PARAMS = ['preset', 'start', 'end', 'station', 'filter', 'mode', 'stations'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const accessKey = Deno.env.get('SCREENSHOTONE_ACCESS_KEY');
    if (!accessKey) throw new Error('SCREENSHOTONE_ACCESS_KEY is not configured');

    const reqUrl = new URL(req.url);

    // Build the /embed URL from a safe subset of forwarded params
    const embed = new URL(`${APP_ORIGIN}/embed`);
    for (const key of ALLOWED_PARAMS) {
      const value = reqUrl.searchParams.get(key);
      if (value) embed.searchParams.set(key, value);
    }
    if (!embed.searchParams.has('preset') && !embed.searchParams.has('start')) {
      embed.searchParams.set('preset', 'today');
    }

    const width = Math.min(Math.max(Number(reqUrl.searchParams.get('width')) || 1200, 320), 2000);
    const height = Math.min(Math.max(Number(reqUrl.searchParams.get('height')) || 675, 240), 1400);
    const ttl = Math.min(Math.max(Number(reqUrl.searchParams.get('ttl')) || 14400, 14400), 43200);

    const shot = new URL('https://api.screenshotone.com/take');
    shot.searchParams.set('access_key', accessKey);
    shot.searchParams.set('url', embed.toString());
    shot.searchParams.set('viewport_width', String(width));
    shot.searchParams.set('viewport_height', String(height));
    shot.searchParams.set('format', 'png');
    shot.searchParams.set('block_ads', 'true');
    shot.searchParams.set('block_cookie_banners', 'true');
    shot.searchParams.set('delay', '8');
    shot.searchParams.set('cache', 'true');
    shot.searchParams.set('cache_ttl', String(ttl));

    const res = await fetch(shot.toString());
    if (!res.ok) {
      const detail = await res.text();
      return new Response(JSON.stringify({ error: 'screenshot failed', status: res.status, detail }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(res.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/png',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
