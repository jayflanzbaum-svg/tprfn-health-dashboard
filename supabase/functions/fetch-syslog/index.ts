import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SYSLOG_URL = 'https://tprfn.k1ajd.net/VARAHF.txt';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching syslog data from:', SYSLOG_URL);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    
    let response: Response;
    try {
      response = await fetch(SYSLOG_URL, { signal: controller.signal });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Fetch failed';
      console.warn('Syslog fetch failed (external server may be down):', msg);
      return new Response(JSON.stringify({ content: '', error: msg, partial: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error('Failed to fetch syslog:', response.status, response.statusText);
      return new Response(JSON.stringify({ content: '', error: `HTTP ${response.status}`, partial: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const content = await response.text();
    console.log('Successfully fetched syslog data, length:', content.length);

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in fetch-syslog function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
