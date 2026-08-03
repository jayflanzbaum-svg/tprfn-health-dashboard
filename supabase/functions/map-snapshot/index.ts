import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const APP_ORIGIN = 'https://tprfn-health-dashboard.lovable.app';
const ALLOWED_PARAMS = ['preset', 'start', 'end', 'station', 'filter', 'mode', 'stations'];
const BUCKET = 'map-snapshots';

async function keyFor(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('') + '.png';
}

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
    // Our own cache window, in seconds. Default 10 minutes, min 60s, max 12h.
    const ttl = Math.min(Math.max(Number(reqUrl.searchParams.get('ttl')) || 600, 60), 43200);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const objectKey = await keyFor(`${embed.toString()}|${width}x${height}`);

    // Serve the stored PNG when it is still inside the TTL window
    const { data: listed } = await supabase.storage
      .from(BUCKET)
      .list('', { search: objectKey, limit: 1 });
    const existing = listed?.find((f) => f.name === objectKey);
    const ageMs = existing
      ? Date.now() - new Date(existing.updated_at ?? existing.created_at ?? 0).getTime()
      : Infinity;

    if (existing && ageMs < ttl * 1000) {
      const { data: cached } = await supabase.storage.from(BUCKET).download(objectKey);
      if (cached) {
        return new Response(await cached.arrayBuffer(), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'image/png',
            'Cache-Control': `public, max-age=${Math.max(30, ttl - Math.floor(ageMs / 1000))}`,
            'X-Snapshot-Cache': 'hit',
          },
        });
      }
    }

    const shot = new URL('https://api.screenshotone.com/take');
    shot.searchParams.set('access_key', accessKey);
    shot.searchParams.set('url', embed.toString());
    shot.searchParams.set('viewport_width', String(width));
    shot.searchParams.set('viewport_height', String(height));
    shot.searchParams.set('format', 'png');
    shot.searchParams.set('block_ads', 'true');
    shot.searchParams.set('block_cookie_banners', 'true');
    shot.searchParams.set('delay', '8');
    shot.searchParams.set('cache', 'false');

    const res = await fetch(shot.toString());
    if (!res.ok) {
      const detail = await res.text();
      // Fall back to a stale snapshot rather than failing the <img> tag
      if (existing) {
        const { data: stale } = await supabase.storage.from(BUCKET).download(objectKey);
        if (stale) {
          return new Response(await stale.arrayBuffer(), {
            headers: {
              ...corsHeaders,
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=60',
              'X-Snapshot-Cache': 'stale',
            },
          });
        }
      }
      return new Response(JSON.stringify({ error: 'screenshot failed', status: res.status, detail }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    await supabase.storage.from(BUCKET).upload(objectKey, bytes, {
      contentType: 'image/png',
      upsert: true,
    });

    return new Response(bytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/png',
        'Cache-Control': `public, max-age=${ttl}`,
        'X-Snapshot-Cache': 'miss',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
