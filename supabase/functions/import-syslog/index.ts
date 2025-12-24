import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Year inference state - logs go from oldest to newest
// Last known record is Dec 22, 2025, so we work backwards when month increases
const monthMap: Record<string, number> = {
  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
  'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
};

// We need to first scan to find the last month, then process forward
// Since file ends in Dec 2025, we process forward and detect year boundaries
// When month goes from Dec -> Jan (or similar decreases), we're in a new year going forward
// But since log is chronological (oldest first), month going from Dec to Jan means year++

let lastMonth: number | null = null;
let currentYear = 2025; // Data ends in Dec 2025, starts in Jan 2025

function resetYearState() {
  lastMonth = null;
  currentYear = 2025;
}

function inferYearForMonth(month: string, day: number): number {
  const monthNum = monthMap[month];
  
  if (lastMonth !== null && lastMonth === 11 && monthNum === 0) {
    // Dec -> Jan = year increment (logs are chronological, oldest first)
    currentYear++;
  }
  
  lastMonth = monthNum;
  return currentYear;
}

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
  
  // Infer year based on month transitions
  const year = inferYearForMonth(monthStr, day);
  const parsedDate = new Date(year, monthMap[monthStr] || 0, day, hours, minutes, seconds);
  
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { url, startByte = 0, chunkSize = 10000000 } = await req.json(); // 10MB default chunks
    
    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
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