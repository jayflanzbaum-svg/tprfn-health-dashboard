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
    
    const response = await fetch(SYSLOG_URL);
    
    if (!response.ok) {
      console.error('Failed to fetch syslog:', response.status, response.statusText);
      throw new Error(`Failed to fetch syslog data: ${response.status}`);
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
