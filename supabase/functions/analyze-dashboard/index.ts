import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { dateRange, callsigns, selectedStation } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch current period KPIs
    const { data: currentKpi, error: e1 } = await supabase.rpc("syslog_kpis", {
      start_ts: dateRange.start,
      end_ts: dateRange.end,
      allowed_callsigns: callsigns,
      selected_station: selectedStation || null,
    });
    if (e1) throw new Error(e1.message);

    // Calculate comparison period (same duration, immediately before)
    const startMs = new Date(dateRange.start).getTime();
    const endMs = new Date(dateRange.end).getTime();
    const durationMs = endMs - startMs;
    const prevStart = new Date(startMs - durationMs).toISOString();
    const prevEnd = new Date(startMs).toISOString();

    const { data: prevKpi, error: e2 } = await supabase.rpc("syslog_kpis", {
      start_ts: prevStart,
      end_ts: prevEnd,
      allowed_callsigns: callsigns,
      selected_station: selectedStation || null,
    });
    if (e2) throw new Error(e2.message);

    // Get detailed station data for top performers and totals
    // Get detailed station data - fetch ALL rows using pagination
    let stationBreakdown: any[] = [];
    let offset = 0;
    const PAGE_SIZE = 5000;
    while (true) {
      const { data: page, error: pageErr } = await supabase
        .from("syslog_entries")
        .select("callsign, remote_callsign, snr, event_type, bytes_sent, bytes_received, bitrate")
        .gte("timestamp", dateRange.start)
        .lte("timestamp", dateRange.end)
        .not("remote_callsign", "is", null)
        .range(offset, offset + PAGE_SIZE - 1);
      if (pageErr) throw new Error(pageErr.message);
      if (!page || page.length === 0) break;
      stationBreakdown = stationBreakdown.concat(page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const upperCallsigns = callsigns.map((c: string) => c.toUpperCase().trim());

    // Aggregate per-station S/N
    const stationSN: Record<string, { sum: number; count: number }> = {};
    // Count unique stations, station pairs, and connections
    const uniqueStations = new Set<string>();
    const uniquePairs = new Set<string>();
    let totalConnections = 0;

    // Top data transfer stations
    const stationData: Record<string, number> = {};
    // Peak bitrate per station
    const stationPeakBitrate: Record<string, number> = {};
    // Unique partners per station
    const stationPartners: Record<string, Set<string>> = {};

    for (const row of stationBreakdown || []) {
      const cs = (row.callsign || "").toUpperCase().replace(/-\d+$/, "");
      const rc = (row.remote_callsign || "").toUpperCase().replace(/-\d+$/, "");

      // Track unique stations and pairs
      if (cs) uniqueStations.add(cs);
      if (rc) uniqueStations.add(rc);
      if (cs && rc) {
        const sorted = [cs, rc].sort();
        uniquePairs.add(`${sorted[0]}↔${sorted[1]}`);
      }

      // Count connections and track partners
      if (row.event_type === "connect_in" || row.event_type === "connect_out") {
        totalConnections++;
        if (cs && rc) {
          if (!stationPartners[cs]) stationPartners[cs] = new Set();
          stationPartners[cs].add(rc);
          if (!stationPartners[rc]) stationPartners[rc] = new Set();
          stationPartners[rc].add(cs);
        }
      }

      // S/N aggregation for hub stations
      if (row.event_type === "sn_report" && row.snr != null) {
        if (upperCallsigns.includes(cs)) {
          if (!stationSN[cs]) stationSN[cs] = { sum: 0, count: 0 };
          stationSN[cs].sum += row.snr;
          stationSN[cs].count++;
        }
        if (rc && upperCallsigns.includes(rc)) {
          if (!stationSN[rc]) stationSN[rc] = { sum: 0, count: 0 };
          stationSN[rc].sum += row.snr;
          stationSN[rc].count++;
        }
      }

      // Data transfer and bitrate for hub stations
      if (row.event_type === "disconnect" || row.event_type === "disconnect_timeout") {
        const bytes = (row.bytes_sent || 0) + (row.bytes_received || 0);
        if (upperCallsigns.includes(cs)) {
          stationData[cs] = (stationData[cs] || 0) + bytes;
        }
        if (row.bitrate && row.bitrate > 0) {
          if (!stationPeakBitrate[cs]) stationPeakBitrate[cs] = 0;
          if (row.bitrate > stationPeakBitrate[cs]) stationPeakBitrate[cs] = row.bitrate;
          if (!stationPeakBitrate[rc]) stationPeakBitrate[rc] = 0;
          if (row.bitrate > stationPeakBitrate[rc]) stationPeakBitrate[rc] = row.bitrate;
        }
      }
    }

    // Top bitrate stations
    const topBitrateStations = Object.entries(stationPeakBitrate)
      .filter(([_, br]) => br > 0)
      .map(([cs, br]) => ({ cs, bitrate: br }))
      .sort((a, b) => b.bitrate - a.bitrate)
      .slice(0, 5);

    // Top partners
    const topPartnerStations = Object.entries(stationPartners)
      .map(([cs, partners]) => ({ cs, partners: partners.size }))
      .sort((a, b) => b.partners - a.partners)
      .slice(0, 5);

    // Fetch station locations for distance calculation
    const allStationCallsigns = Array.from(uniqueStations);
    const { data: locations } = await supabase
      .from("station_locations")
      .select("callsign, latitude, longitude")
      .in("callsign", allStationCallsigns)
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    const locMap: Record<string, { lat: number; lon: number }> = {};
    for (const loc of locations || []) {
      locMap[loc.callsign.toUpperCase()] = { lat: Number(loc.latitude), lon: Number(loc.longitude) };
    }

    // Haversine distance in miles
    function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 3959; // miles
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // Find longest distance pairs
    const pairDistances: { pair: string; distance: number }[] = [];
    for (const pairStr of uniquePairs) {
      const [a, b] = pairStr.split("↔");
      if (locMap[a] && locMap[b]) {
        const d = haversine(locMap[a].lat, locMap[a].lon, locMap[b].lat, locMap[b].lon);
        pairDistances.push({ pair: pairStr, distance: Math.round(d) });
      }
    }
    pairDistances.sort((a, b) => b.distance - a.distance);
    const topDistancePairs = pairDistances.slice(0, 5);

    const stationStats = Object.entries(stationSN)
      .map(([callsign, { sum, count }]) => ({
        callsign,
        avgSN: +(sum / count).toFixed(1),
        readings: count,
      }))
      .sort((a, b) => b.avgSN - a.avgSN);

    // Top data movers
    const topDataStations = Object.entries(stationData)
      .map(([cs, bytes]) => ({ cs, mb: +(bytes / 1024 / 1024).toFixed(2) }))
      .sort((a, b) => b.mb - a.mb)
      .slice(0, 5);

    // Session count per hub station
    const stationSessions: Record<string, number> = {};
    for (const row of stationBreakdown || []) {
      if (row.event_type === "connect_in" || row.event_type === "connect_out") {
        const cs = (row.callsign || "").toUpperCase().replace(/-\d+$/, "");
        if (upperCallsigns.includes(cs)) {
          stationSessions[cs] = (stationSessions[cs] || 0) + 1;
        }
      }
    }
    const topSessionStations = Object.entries(stationSessions)
      .map(([cs, count]) => ({ cs, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Get disconnect types for failure analysis
    const stationDisconnects: Record<string, { normal: number; timeout: number }> = {};
    for (const row of stationBreakdown || []) {
      if (row.event_type !== "disconnect" && row.event_type !== "disconnect_timeout") continue;
      const cs = (row.callsign || "").toUpperCase().replace(/-\d+$/, "");
      if (!stationDisconnects[cs]) stationDisconnects[cs] = { normal: 0, timeout: 0 };
      if (row.event_type === "disconnect_timeout") {
        stationDisconnects[cs].timeout++;
      } else {
        stationDisconnects[cs].normal++;
      }
    }

    // Fetch net sessions that overlap or are near the current period
    const { data: netSessions } = await supabase
      .from("net_sessions")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);

    // Find nets within current period and the most recent previous nets for comparison
    const currentNets = (netSessions || []).filter((n: any) => {
      const ns = new Date(n.started_at).getTime();
      const ne = new Date(n.ended_at).getTime();
      return ns >= startMs && ne <= endMs;
    });

    // Get KPIs for each net in current period (up to 3)
    const netComparisons: any[] = [];
    const netsToCompare = (netSessions || []).slice(0, 8); // last 8 nets for trend

    for (const net of netsToCompare) {
      const { data: netKpi } = await supabase.rpc("syslog_kpis", {
        start_ts: net.started_at,
        end_ts: net.ended_at,
        allowed_callsigns: callsigns,
        selected_station: selectedStation || null,
      });
      const k = netKpi?.[0] || {};
      netComparisons.push({
        name: net.name,
        date: new Date(net.started_at).toISOString().slice(0, 10),
        avgSN: k.avg_sn || 0,
        sessions: k.sessions || 0,
        totalData: k.total_data || 0,
        successRate: k.success_rate || 0,
        snReadings: k.sn_readings || 0,
      });
    }

    const cur = currentKpi?.[0] || {};
    const prev = prevKpi?.[0] || {};
    const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24));

    let netSection = "";
    if (netComparisons.length >= 2) {
      netSection = `
NET-TO-NET COMPARISON (most recent ${netComparisons.length} nets):
${netComparisons.map((n) => `- ${n.name} (${n.date}): Avg S/N ${n.avgSN} dB, ${n.sessions} sessions, ${(n.totalData / 1024).toFixed(1)} KB data, ${n.successRate}% success`).join("\n")}

Compare the most recent net to the previous one AND note any trends across all listed nets.`;
    } else if (netComparisons.length === 1) {
      netSection = `
NET SESSION DATA (1 net logged):
- ${netComparisons[0].name} (${netComparisons[0].date}): Avg S/N ${netComparisons[0].avgSN} dB, ${netComparisons[0].sessions} sessions, ${netComparisons[0].successRate}% success
No previous net to compare against yet.`;
    }

    const prompt = `You are an RF network analyst for the TPRFN (Transcontinental Pacific Radio Frequency Network) which uses VARA HF digital radio. Analyze this dashboard data and provide SHORT, ACTIONABLE insights. Be concise — no more than 8 bullet points total.

CURRENT PERIOD (${durationDays} days ending ${dateRange.end}):
- Avg S/N: ${cur.avg_sn || 0} dB
- S/N Readings: ${cur.sn_readings || 0}
- Sessions: ${cur.sessions || 0}
- Total Data: ${cur.total_data || 0} bytes
- Success Rate (S/N ≥ 5): ${cur.success_rate || 0}%

PREVIOUS PERIOD (same duration, immediately before):
- Avg S/N: ${prev.avg_sn || 0} dB
- S/N Readings: ${prev.sn_readings || 0}
- Sessions: ${prev.sessions || 0}
- Total Data: ${prev.total_data || 0} bytes
- Success Rate: ${prev.success_rate || 0}%

TOTALS FOR CURRENT PERIOD:
- Total Connections: ${totalConnections}
- Unique Stations: ${uniqueStations.size}
- Unique Station Pairs: ${uniquePairs.size}

TOP PERFORMERS — #1 in each category (use EXACTLY these values, do not change them):
Best Signal Quality (S/N): ${stationStats[0] ? `${stationStats[0].callsign} = ${stationStats[0].avgSN} dB avg` : "N/A"}
Most Station Partners: ${topPartnerStations[0] ? `${topPartnerStations[0].cs} = ${topPartnerStations[0].partners} unique partners` : "N/A"}
Highest Data Throughput: ${topDataStations[0] ? `${topDataStations[0].cs} = ${topDataStations[0].mb} MB` : "N/A"}
Most Sessions: ${topSessionStations[0] ? `${topSessionStations[0].cs} = ${topSessionStations[0].count} sessions` : "N/A"}
Best Bitrate: ${topBitrateStations[0] ? `${topBitrateStations[0].cs} = ${topBitrateStations[0].bitrate} bps peak` : "N/A"}
Longest Distance: ${topDistancePairs[0] ? `${topDistancePairs[0].pair} = ${topDistancePairs[0].distance} mi` : "N/A"}

RUNNERS-UP (for context only, not top performers):
Signal Quality: ${stationStats.slice(1, 5).map(s => `${s.callsign}: ${s.avgSN} dB`).join(", ")}
Partners: ${topPartnerStations.slice(1, 5).map(s => `${s.cs}: ${s.partners}`).join(", ")}
Data: ${topDataStations.slice(1, 5).map(s => `${s.cs}: ${s.mb} MB`).join(", ")}
Sessions: ${topSessionStations.slice(1, 5).map(s => `${s.cs}: ${s.count}`).join(", ")}
Bitrate: ${topBitrateStations.slice(1, 5).map(s => `${s.cs}: ${s.bitrate} bps`).join(", ")}
Distance: ${topDistancePairs.slice(1, 5).map(p => `${p.pair}: ${p.distance} mi`).join(", ")}

BOTTOM STATIONS BY S/N: ${JSON.stringify(stationStats.slice(-3).reverse())}

DISCONNECT ANALYSIS (stations with highest timeout ratios):
${Object.entries(stationDisconnects)
  .map(([cs, d]) => ({ cs, ...d, rate: d.timeout / (d.normal + d.timeout) }))
  .sort((a, b) => b.rate - a.rate)
  .slice(0, 5)
  .map((d) => `${d.cs}: ${d.timeout} timeouts / ${d.normal + d.timeout} total (${(d.rate * 100).toFixed(0)}%)`)
  .join("\n")}
${netSection}

${selectedStation ? `FILTER: Analysis is for station ${selectedStation} only.` : ""}

Guidelines:
- Start with a 1-line summary of totals: X connections, Y unique stations, Z station pairs
- Highlight TOP PERFORMERS — copy the EXACT callsign and EXACT value from the "#1 in each category" section above. Do NOT substitute, round, or use any other value.
- Call out what STANDS OUT positively or negatively vs. previous period
- Note any concerning timeout/disconnect patterns
${netComparisons.length >= 2 ? "- Compare the latest net to previous nets and note any trends" : ""}
- Keep it practical — what should a net operator pay attention to?
- Use callsigns in your analysis
- Format as markdown bullet points
- Quote top performer values exactly as given (e.g. if Best Bitrate says "KD6MTU = 4025 bps peak", write "KD6MTU led with 4025 bps peak bitrate")`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a concise RF network analyst. Respond only with markdown bullet points. No introductions or conclusions." },
          { role: "user", content: prompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI analysis failed");
    }

    const result = await response.json();
    const analysis = result.choices?.[0]?.message?.content || "No insights generated.";

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
