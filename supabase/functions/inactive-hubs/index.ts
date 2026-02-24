import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Get all hub callsigns
    const { data: hubs, error: hubErr } = await supabase
      .from("hub_callsigns")
      .select("callsign");
    if (hubErr) throw hubErr;

    const allowedCallsigns = (hubs || []).map((h) =>
      h.callsign.toUpperCase().trim()
    );
    if (allowedCallsigns.length === 0) {
      return new Response(
        JSON.stringify({ inactive: [], checked_at: new Date().toISOString(), total_hubs: 0 }),
        { headers: corsHeaders }
      );
    }

    // 2. Get paused stations
    const { data: paused } = await supabase
      .from("station_locations")
      .select("callsign")
      .eq("is_paused", true);
    const pausedSet = new Set(
      (paused || []).map((s) => s.callsign.toUpperCase())
    );

    // 3. Fetch last 24h activity
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const callsignFilters = allowedCallsigns
      .map((c) => `callsign.eq.${c},remote_callsign.eq.${c}`)
      .join(",");

    const { data: entries, error: entryErr } = await supabase
      .from("syslog_entries")
      .select("callsign, remote_callsign, timestamp")
      .gte("timestamp", twentyFourHoursAgo.toISOString())
      .in("event_type", ["connect_in", "connect_out", "sn_report"])
      .or(callsignFilters)
      .limit(5000);

    if (entryErr) throw entryErr;

    // Build last-activity map
    const lastActivityMap = new Map<string, string>();
    const allowedSet = new Set(allowedCallsigns);

    for (const entry of entries || []) {
      const station = (entry.callsign || "").toUpperCase().trim();
      const partner = (entry.remote_callsign || "").toUpperCase().trim();
      const ts = entry.timestamp;

      for (const cs of [station, partner]) {
        if (cs && allowedSet.has(cs)) {
          const existing = lastActivityMap.get(cs);
          if (!existing || ts > existing) {
            lastActivityMap.set(cs, ts);
          }
        }
      }
    }

    // 4. Find inactive (not seen in 24h, not paused)
    const inactive: { callsign: string; last_seen: string | null }[] = [];

    for (const callsign of allowedCallsigns) {
      if (pausedSet.has(callsign)) continue;
      const lastActivity = lastActivityMap.get(callsign);
      if (!lastActivity) {
        inactive.push({ callsign, last_seen: null });
      }
    }

    // 5. For inactive stations, fetch their most recent activity ever
    for (const station of inactive) {
      const { data: lastEntry } = await supabase
        .from("syslog_entries")
        .select("timestamp")
        .or(
          `callsign.eq.${station.callsign},remote_callsign.eq.${station.callsign}`
        )
        .in("event_type", ["connect_in", "connect_out", "sn_report"])
        .order("timestamp", { ascending: false })
        .limit(1);

      if (lastEntry && lastEntry.length > 0) {
        station.last_seen = lastEntry[0].timestamp;
      }
    }

    // Sort by last_seen (null first, then oldest)
    inactive.sort((a, b) => {
      if (!a.last_seen && !b.last_seen) return 0;
      if (!a.last_seen) return -1;
      if (!b.last_seen) return 1;
      return a.last_seen < b.last_seen ? -1 : 1;
    });

    return new Response(
      JSON.stringify({
        inactive,
        checked_at: now.toISOString(),
        total_hubs: allowedCallsigns.length,
        paused_count: pausedSet.size,
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
