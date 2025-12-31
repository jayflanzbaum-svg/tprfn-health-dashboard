import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AggregatedData {
  // Daily aggregates for S/N heatmaps
  dailySNAggregates: Array<{
    date: string;
    hour: number;
    avgSN: number;
    count: number;
  }>;
  // Monthly aggregates
  monthlySNAggregates: Array<{
    year: number;
    month: number;
    week: number;
    avgSN: number;
    count: number;
  }>;
  // Connection stats by station pair
  connectionStats: Array<{
    station1: string;
    station2: string;
    avgSN: number;
    sessionCount: number;
    totalTxBytes: number;
    totalRxBytes: number;
    snCount: number;
    avgBitrate: number;
    maxBitrate: number;
    maxBitrateAt: string | null;
  }>;
  // Total record counts
  totalRecords: number;
  dateRange: {
    start: string;
    end: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { startDate, endDate, callsigns } = await req.json();
    
    console.log(`Aggregating data from ${startDate} to ${endDate} for ${callsigns?.length || 0} callsigns`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const callsignSet = new Set((callsigns || []).map((c: string) => c.toUpperCase().trim()));
    const callsignArray = Array.from(callsignSet);

    // Fetch in batches using cursor-based pagination (timestamp + id)
    // NOTE: PostgREST enforces a max of 1000 rows per request, so keep pageSize at 1000.
    // UUIDs are not time-ordered, so we must page by (timestamp, id) to avoid skipping rows.
    const allEntries: any[] = [];
    const pageSize = 1000;
    let iterations = 0;
    const maxIterations = 600;

    const startIso = new Date(startDate).toISOString();
    let cursorTimestamp = startIso;
    let cursorId = '00000000-0000-0000-0000-000000000000';

    while (iterations < maxIterations) {
      let batchQuery = supabase
        .from('syslog_entries')
        .select('id, timestamp, callsign, remote_callsign, event_type, snr, bytes_sent, bytes_received, bitrate, duration_seconds')
        .gte('timestamp', startDate)
        .lte('timestamp', endDate)
        // If callsigns are provided, filter server-side by the hub callsign (fast + reduces payload)
        .in('callsign', callsignArray.length > 0 ? callsignArray : ['__NO_MATCH__'])
        .or(
          `timestamp.gt.${cursorTimestamp},and(timestamp.eq.${cursorTimestamp},id.gt.${cursorId})`
        )
        .order('timestamp', { ascending: true })
        .order('id', { ascending: true })
        .limit(pageSize);

      // If no callsigns were provided, remove the forced no-match filter by rebuilding the query.
      if (callsignArray.length === 0) {
        batchQuery = supabase
          .from('syslog_entries')
          .select('id, timestamp, callsign, remote_callsign, event_type, snr, bytes_sent, bytes_received, bitrate, duration_seconds')
          .gte('timestamp', startDate)
          .lte('timestamp', endDate)
          .or(
            `timestamp.gt.${cursorTimestamp},and(timestamp.eq.${cursorTimestamp},id.gt.${cursorId})`
          )
          .order('timestamp', { ascending: true })
          .order('id', { ascending: true })
          .limit(pageSize);
      }

      const { data: entries, error } = await batchQuery;

      if (error) {
        console.error('Query error:', error);
        throw new Error(error.message);
      }

      if (!entries || entries.length === 0) break;

      allEntries.push(...entries);

      const lastEntry = entries[entries.length - 1];
      cursorTimestamp = lastEntry.timestamp;
      cursorId = lastEntry.id;
      iterations++;

      if (entries.length < pageSize) break;

      // Yield occasionally to avoid blocking the event loop
      if (iterations % 10 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    console.log(`Fetched ${allEntries.length} entries in ${iterations} iterations`);

    // Now aggregate the data on the server
    const dailySNMap = new Map<string, { total: number; count: number }>();
    const monthlySNMap = new Map<string, { total: number; count: number }>();
    const connectionMap = new Map<string, {
      station1: string;
      station2: string;
      snTotal: number;
      snCount: number;
      sessionCount: number;
      totalTxBytes: number;
      totalRxBytes: number;
      bitrateTotal: number;
      bitrateCount: number;
      maxBitrate: number;
      maxBitrateAt: string | null;
    }>();

    // Helps attribute disconnect records that don't include remote_callsign
    const lastPartnerMap = new Map<string, { partner: string; timestamp: Date }>();
    const MAX_PARTNER_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

    let minDate = new Date();
    let maxDate = new Date(0);

    for (const entry of allEntries) {
      const timestamp = new Date(entry.timestamp);
      const station = entry.callsign?.toUpperCase().trim() || '';
      const partner = entry.remote_callsign?.toUpperCase().trim() || '';

      if (timestamp < minDate) minDate = timestamp;
      if (timestamp > maxDate) maxDate = timestamp;

      // Create connection ID (sorted)
      const connectionId = [station, partner].filter(Boolean).sort().join('↔');

      if (entry.event_type === 'sn_report' && entry.snr !== null && partner) {
        // Daily aggregate (date + hour)
        const dateStr = timestamp.toISOString().split('T')[0];
        const hour = timestamp.getUTCHours();
        const dailyKey = `${dateStr}-${hour}`;

        if (!dailySNMap.has(dailyKey)) {
          dailySNMap.set(dailyKey, { total: 0, count: 0 });
        }
        const daily = dailySNMap.get(dailyKey)!;
        daily.total += entry.snr;
        daily.count++;

        // Monthly aggregate (year + month + week)
        const year = timestamp.getUTCFullYear();
        const month = timestamp.getUTCMonth();
        const day = timestamp.getUTCDate();
        const week = Math.ceil(day / 7);
        const monthlyKey = `${year}-${month}-${week}`;

        if (!monthlySNMap.has(monthlyKey)) {
          monthlySNMap.set(monthlyKey, { total: 0, count: 0 });
        }
        const monthly = monthlySNMap.get(monthlyKey)!;
        monthly.total += entry.snr;
        monthly.count++;

        // Remember partner for this station (helps later for disconnect records)
        lastPartnerMap.set(station, { partner, timestamp });
        lastPartnerMap.set(partner, { partner: station, timestamp });

        // Connection stats
        if (!connectionMap.has(connectionId)) {
          connectionMap.set(connectionId, {
            station1: station < partner ? station : partner,
            station2: station < partner ? partner : station,
            snTotal: 0,
            snCount: 0,
            sessionCount: 0,
            totalTxBytes: 0,
            totalRxBytes: 0,
            bitrateTotal: 0,
            bitrateCount: 0,
            maxBitrate: 0,
            maxBitrateAt: null,
          });
        }
        const conn = connectionMap.get(connectionId)!;
        conn.snTotal += entry.snr;
        conn.snCount++;
      }

      if (entry.event_type === 'connect_in' || entry.event_type === 'connect_out') {
        if (!partner) continue;

        if (!connectionMap.has(connectionId)) {
          connectionMap.set(connectionId, {
            station1: station < partner ? station : partner,
            station2: station < partner ? partner : station,
            snTotal: 0,
            snCount: 0,
            sessionCount: 0,
            totalTxBytes: 0,
            totalRxBytes: 0,
            bitrateTotal: 0,
            bitrateCount: 0,
            maxBitrate: 0,
            maxBitrateAt: null,
          });
        }
        connectionMap.get(connectionId)!.sessionCount++;

        // Remember partner for this station (helps later for disconnect records)
        lastPartnerMap.set(station, { partner, timestamp });
        lastPartnerMap.set(partner, { partner: station, timestamp });
      }

       if (entry.event_type === 'disconnect' || entry.event_type === 'disconnect_timeout') {
         // Disconnect rows often don't have remote_callsign; infer it from the latest known partner
         let resolvedPartner = partner;
         if (!resolvedPartner) {
           const last = lastPartnerMap.get(station);
           if (last && timestamp.getTime() - last.timestamp.getTime() <= MAX_PARTNER_WINDOW_MS) {
             resolvedPartner = last.partner;
           }
         }
         if (!resolvedPartner) continue;

         const resolvedConnectionId = [station, resolvedPartner].filter(Boolean).sort().join('↔');
         if (!resolvedConnectionId.includes('↔')) continue;

         if (!connectionMap.has(resolvedConnectionId)) {
           connectionMap.set(resolvedConnectionId, {
             station1: station < resolvedPartner ? station : resolvedPartner,
             station2: station < resolvedPartner ? resolvedPartner : station,
             snTotal: 0,
             snCount: 0,
             sessionCount: 0,
             totalTxBytes: 0,
             totalRxBytes: 0,
             bitrateTotal: 0,
             bitrateCount: 0,
             maxBitrate: 0,
             maxBitrateAt: null,
           });
         }

         const conn = connectionMap.get(resolvedConnectionId)!;
         conn.totalTxBytes += entry.bytes_sent || 0;
         conn.totalRxBytes += entry.bytes_received || 0;

         const bitrate = typeof entry.bitrate === 'number' ? entry.bitrate : null;
         if (bitrate !== null && bitrate > 0) {
           conn.bitrateTotal += bitrate;
           conn.bitrateCount++;
           if (bitrate > conn.maxBitrate) {
             conn.maxBitrate = bitrate;
             conn.maxBitrateAt = timestamp.toISOString();
           }
         }
       }
    }

    // Convert maps to arrays
    const dailySNAggregates: AggregatedData['dailySNAggregates'] = [];
    dailySNMap.forEach((val, key) => {
      const [date, hourStr] = key.split('-').length === 4 
        ? [key.substring(0, 10), key.substring(11)]
        : [key.substring(0, 10), key.split('-').pop()!];
      dailySNAggregates.push({
        date: key.substring(0, 10),
        hour: parseInt(key.split('-').pop()!, 10),
        avgSN: val.total / val.count,
        count: val.count
      });
    });

    const monthlySNAggregates: AggregatedData['monthlySNAggregates'] = [];
    monthlySNMap.forEach((val, key) => {
      const parts = key.split('-');
      monthlySNAggregates.push({
        year: parseInt(parts[0], 10),
        month: parseInt(parts[1], 10),
        week: parseInt(parts[2], 10),
        avgSN: val.total / val.count,
        count: val.count
      });
    });

    const connectionStats: AggregatedData['connectionStats'] = [];
    connectionMap.forEach((val) => {
       connectionStats.push({
         station1: val.station1,
         station2: val.station2,
         avgSN: val.snCount > 0 ? val.snTotal / val.snCount : 0,
         sessionCount: val.sessionCount,
         totalTxBytes: val.totalTxBytes,
         totalRxBytes: val.totalRxBytes,
         snCount: val.snCount,
         avgBitrate: val.bitrateCount > 0 ? val.bitrateTotal / val.bitrateCount : 0,
         maxBitrate: val.maxBitrate,
         maxBitrateAt: val.maxBitrateAt,
       });
    });

    const result: AggregatedData = {
      dailySNAggregates,
      monthlySNAggregates,
      connectionStats,
      totalRecords: allEntries.length,
      dateRange: {
        start: minDate.toISOString(),
        end: maxDate.toISOString()
      }
    };

    console.log(`Returning ${dailySNAggregates.length} daily aggregates, ${monthlySNAggregates.length} monthly aggregates, ${connectionStats.length} connections`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in aggregate-syslog:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
