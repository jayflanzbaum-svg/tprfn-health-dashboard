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

    // Get top/bottom stations by S/N for the current period
    const { data: stationBreakdown } = await supabase
      .from("syslog_entries")
      .select("callsign, remote_callsign, snr")
      .gte("timestamp", dateRange.start)
      .lte("timestamp", dateRange.end)
      .eq("event_type", "sn_report")
      .not("snr", "is", null)
      .not("remote_callsign", "is", null)
      .limit(5000);

    // Aggregate per-station S/N
    const stationSN: Record<string, { sum: number; count: number }> = {};
    for (const row of stationBreakdown || []) {
      const cs = (row.callsign || "").toUpperCase().replace(/-\d+$/, "");
      const rc = (row.remote_callsign || "").toUpperCase().replace(/-\d+$/, "");
      const upperCallsigns = callsigns.map((c: string) => c.toUpperCase().trim());
      
      // Only count hub stations
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

    const stationStats = Object.entries(stationSN)
      .map(([callsign, { sum, count }]) => ({
        callsign,
        avgSN: +(sum / count).toFixed(1),
        readings: count,
      }))
      .sort((a, b) => b.avgSN - a.avgSN);

    // Get disconnect types for failure analysis
    const { data: disconnects } = await supabase
      .from("syslog_entries")
      .select("callsign, event_type")
      .gte("timestamp", dateRange.start)
      .lte("timestamp", dateRange.end)
      .in("event_type", ["disconnect", "disconnect_timeout"])
      .limit(5000);

    const stationDisconnects: Record<string, { normal: number; timeout: number }> = {};
    for (const row of disconnects || []) {
      const cs = (row.callsign || "").toUpperCase().replace(/-\d+$/, "");
      if (!stationDisconnects[cs]) stationDisconnects[cs] = { normal: 0, timeout: 0 };
      if (row.event_type === "disconnect_timeout") {
        stationDisconnects[cs].timeout++;
      } else {
        stationDisconnects[cs].normal++;
      }
    }

    const cur = currentKpi?.[0] || {};
    const prev = prevKpi?.[0] || {};

    const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24));

    const prompt = `You are an RF network analyst for the TPRFN (Transcontinental Pacific Radio Frequency Network) which uses VARA HF digital radio. Analyze this dashboard data and provide SHORT, ACTIONABLE insights. Be concise — no more than 5-6 bullet points total.

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

TOP STATIONS BY S/N (best first): ${JSON.stringify(stationStats.slice(0, 5))}
BOTTOM STATIONS BY S/N (worst first): ${JSON.stringify(stationStats.slice(-5).reverse())}

DISCONNECT ANALYSIS (stations with highest timeout ratios):
${Object.entries(stationDisconnects)
  .map(([cs, d]) => ({ cs, ...d, rate: d.timeout / (d.normal + d.timeout) }))
  .sort((a, b) => b.rate - a.rate)
  .slice(0, 5)
  .map((d) => `${d.cs}: ${d.timeout} timeouts / ${d.normal + d.timeout} total (${(d.rate * 100).toFixed(0)}%)`)
  .join("\n")}

${selectedStation ? `FILTER: Analysis is for station ${selectedStation} only.` : ""}

Guidelines:
- Highlight what STANDS OUT positively or negatively vs. previous period
- Call out specific stations performing notably well or poorly
- Note any concerning timeout/disconnect patterns
- Keep it practical — what should a net operator pay attention to?
- Use callsigns in your analysis
- Format as markdown bullet points
- Do NOT repeat raw numbers verbatim — interpret them`;

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
