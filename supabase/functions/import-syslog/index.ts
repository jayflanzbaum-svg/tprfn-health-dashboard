import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Month mapping for parsing
const monthMap: Record<string, number> = {
  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
  'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
};

// Forced year - passed in request body, no inference
let forcedYear = 2025;

// Parse syslog line and extract structured data
function parseSyslogLine(line: string): {
  timestamp: string | null;
  hub: string | null;
  callsign: string | null;
  remoteCallsign: string | null;
  eventType: string | null;
  snr: number | null;
  bitrate: number | null;
  bytesSent: number | null;
  bytesReceived: number | null;
  durationSeconds: number | null;
  rawMessage: string;
} | null {
  const result = {
    timestamp: null as string | null,
    hub: null as string | null,
    callsign: null as string | null,
    remoteCallsign: null as string | null,
    eventType: null as string | null,
    snr: null as number | null,
    bitrate: null as number | null,
    bytesSent: null as number | null,
    bytesReceived: null as number | null,
    durationSeconds: null as number | null,
    rawMessage: line,
  };

  // Parse timestamp - Format: "Dec 12 00:00:32"
  const timestampMatch = line.match(/^(\w+\s+\d+\s+\d+:\d+:\d+)/);
  if (!timestampMatch) return null;

  const dateStr = timestampMatch[1];
  const monthStr = dateStr.substring(0, 3);
  const day = parseInt(dateStr.match(/\s(\d+)\s/)?.[1] || '1');
  const timeStr = dateStr.match(/(\d+:\d+:\d+)/)?.[1] || '00:00:00';
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  
  // Use the forced year directly (no inference)
  const parsedDate = new Date(forcedYear, monthMap[monthStr] || 0, day, hours, minutes, seconds);
  
  result.timestamp = parsedDate.toISOString();

  // Extract hub - Format: "H-KK4DIV-1"
  const hubMatch = line.match(/\s+(H-[\w-]+)\s+/);
  if (!hubMatch) return null;
  result.hub = hubMatch[1].replace('H-', '');

  // Determine event type and extract callsigns
  const snPattern = /VARAHF\s+([\w-]+)\s+Average\s+S\/N:\s+([-\d.]+)\s*dB/;
  const connectOutPattern = /VARAHF\s+Connected\s+to\s+([\w-]+)\s+VARA/;
  const connectInPattern = /VARAHF\s+([\w-]+)\s+connected\s+VARA/;
  const disconnectPattern = /VARAHF\s+Disconnected(?:\s+\((\w+)\))?\s+TX:\s+(\d+)\s+Bytes\s+\(Max:\s+(\d+)\s+bps\)\s+RX:\s+(\d+)\s+Bytes\s+\(Max:\s+(\d+)\s+bps\)\s+Session\s+Time:\s+(\d+:\d+)/;

  const snMatch = line.match(snPattern);
  if (snMatch) {
    result.callsign = result.hub.replace(/-\d+$/, '');
    result.remoteCallsign = snMatch[1].replace(/-\d+$/, '');
    result.snr = parseFloat(snMatch[2]);
    result.eventType = 'sn_report';
    return result;
  }

  const connectOutMatch = line.match(connectOutPattern);
  if (connectOutMatch) {
    result.callsign = result.hub.replace(/-\d+$/, '');
    result.remoteCallsign = connectOutMatch[1].replace(/-\d+$/, '');
    result.eventType = 'connect_out';
    return result;
  }

  const connectInMatch = line.match(connectInPattern);
  if (connectInMatch) {
    result.callsign = result.hub.replace(/-\d+$/, '');
    result.remoteCallsign = connectInMatch[1].replace(/-\d+$/, '');
    result.eventType = 'connect_in';
    return result;
  }

  const disconnectMatch = line.match(disconnectPattern);
  if (disconnectMatch) {
    result.callsign = result.hub.replace(/-\d+$/, '');
    result.eventType = disconnectMatch[1]?.toLowerCase() === 'timeout' ? 'disconnect_timeout' : 'disconnect';
    result.bytesSent = parseInt(disconnectMatch[2]);
    result.bitrate = parseInt(disconnectMatch[3]);
    result.bytesReceived = parseInt(disconnectMatch[4]);
    const sessionTime = disconnectMatch[6];
    const parts = sessionTime.split(':');
    result.durationSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    return result;
  }

  return null;
}

async function* streamLines(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) yield buffer;
      break;
    }
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) yield line;
    }
  }
}

// Allowed domains for URL fetching (prevents SSRF attacks)
const ALLOWED_DOMAINS = [
  'dropbox.com',
  'www.dropbox.com', 
  'dl.dropboxusercontent.com',
  'dropboxusercontent.com',
  'tprfn.k1ajd.net',
];

// Maximum chunk size (10MB)
const MAX_CHUNK_SIZE = 10000000;

// Valid year range
const MIN_YEAR = 2020;
const MAX_YEAR = 2030;

function isAllowedUrl(urlString: string): boolean {
  try {
    const urlObj = new URL(urlString);
    // Check for private IP ranges and localhost
    const hostname = urlObj.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.') ||
      hostname === '169.254.169.254' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return false;
    }
    // Check against allowed domains
    return ALLOWED_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const url = body.url;
    const startByte = Math.max(0, parseInt(body.startByte) || 0);
    const chunkSize = Math.min(MAX_CHUNK_SIZE, Math.max(1, parseInt(body.chunkSize) || MAX_CHUNK_SIZE));
    const year = Math.min(MAX_YEAR, Math.max(MIN_YEAR, parseInt(body.year) || 2025));
    
    // Set the forced year for this import
    forcedYear = year;
    
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'URL is required and must be a string' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate URL against allowed domains (SSRF protection)
    if (!isAllowedUrl(url)) {
      console.error('URL validation failed:', url);
      return new Response(JSON.stringify({ error: 'URL domain not allowed. Only Dropbox and tprfn.k1ajd.net are permitted.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Convert Dropbox URL for direct download
    let downloadUrl = url;
    if (url.includes('dropbox.com')) {
      downloadUrl = url.replace('dl=0', 'dl=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
    }

    console.log(`Fetching syslog chunk: bytes=${startByte}-${startByte + chunkSize - 1}`);

    const response = await fetch(downloadUrl, {
      headers: {
        'Range': `bytes=${startByte}-${startByte + chunkSize - 1}`
      }
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const contentRange = response.headers.get('Content-Range');
    const totalSize = contentRange ? parseInt(contentRange.split('/')[1]) : null;
    
    console.log('Content-Range:', contentRange, 'Total size:', totalSize);

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    let processed = 0;
    let inserted = 0;
    let errors = 0;
    const batchSize = 200;
    let batch: any[] = [];

    for await (const line of streamLines(reader)) {
      const parsed = parseSyslogLine(line);
      if (!parsed || !parsed.timestamp || !parsed.hub || !parsed.callsign || !parsed.eventType) {
        continue;
      }

      processed++;
      
      batch.push({
        timestamp: parsed.timestamp,
        hub: parsed.hub,
        callsign: parsed.callsign,
        remote_callsign: parsed.remoteCallsign,
        event_type: parsed.eventType,
        snr: parsed.snr,
        bitrate: parsed.bitrate,
        bytes_sent: parsed.bytesSent,
        bytes_received: parsed.bytesReceived,
        duration_seconds: parsed.durationSeconds,
        raw_message: parsed.rawMessage,
      });

      if (batch.length >= batchSize) {
        const { error } = await supabase
          .from('syslog_entries')
          .upsert(batch, { 
            onConflict: 'timestamp,hub,callsign,raw_message',
            ignoreDuplicates: true 
          });

        if (error) {
          console.error('Batch insert error:', error.message);
          errors += batch.length;
        } else {
          inserted += batch.length;
        }
        batch = [];
      }
    }

    // Insert remaining batch
    if (batch.length > 0) {
      const { error } = await supabase
        .from('syslog_entries')
        .upsert(batch, { 
          onConflict: 'timestamp,hub,callsign,raw_message',
          ignoreDuplicates: true 
        });

      if (error) {
        console.error('Final batch error:', error.message);
        errors += batch.length;
      } else {
        inserted += batch.length;
      }
    }

    const nextByte = startByte + chunkSize;
    const hasMore = totalSize ? nextByte < totalSize : false;

    console.log('Chunk complete:', { processed, inserted, errors, hasMore, nextByte });

    return new Response(JSON.stringify({ 
      success: true,
      stats: { processed, inserted, errors },
      nextByte: hasMore ? nextByte : null,
      totalSize,
      complete: !hasMore
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Import error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});