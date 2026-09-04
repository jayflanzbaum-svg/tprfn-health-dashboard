import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

const b64 = (s: string) =>
  btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const header = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

function rawEmail(to: string, subject: string, body: string): string {
  const msg = [
    `To: ${to}`,
    `Subject: ${header(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");
  return b64(msg).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendGmail(to: string, subject: string, body: string) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const connKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!lovableKey || !connKey) {
    throw new Error("Gmail connection is not configured for this project");
  }
  const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: rawEmail(to, subject, body) }),
  });
  if (!res.ok) {
    const details = await res.text();
    console.error(`Gmail send failed [${res.status}]: ${details}`);
    throw new Error(`[${res.status}] ${details}`);
  }
}

function fmt(ts: string | null) {
  return ts ? `${new Date(ts).toISOString().replace("T", " ").slice(0, 16)}Z` : "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: configs, error } = await supabase
      .from("station_alert_configs")
      .select("*")
      .eq("enabled", true);
    if (error) throw error;

    const now = Date.now();
    const results: unknown[] = [];

    for (const cfg of configs ?? []) {
      const callsign = cfg.callsign.toUpperCase();

      const { data: rows } = await supabase
        .from("syslog_entries")
        .select("timestamp")
        .or(`callsign.like.${callsign}*,remote_callsign.like.${callsign}*`)
        .order("timestamp", { ascending: false })
        .limit(1);

      const lastHeard: string | null = rows?.[0]?.timestamp ?? null;
      const silentMs = lastHeard ? now - new Date(lastHeard).getTime() : Infinity;
      const isTest = Number(cfg.threshold_hours) === 0;
      const isDown = !isTest && silentMs > cfg.threshold_hours * 60 * 60 * 1000;

      // Skip paused stations
      const { data: loc } = await supabase
        .from("station_locations")
        .select("is_paused")
        .eq("callsign", callsign)
        .maybeSingle();
      if (loc?.is_paused) continue;

      // Test mode: notify every run so delivery can be verified
      if (isTest) {
        const testSubject = `[TPRFN] ${callsign} alert test`;
        const testBody = `Test message for ${callsign}. Alert delivery is working.\n\nLast heard: ${fmt(lastHeard)}\nChecked: ${fmt(new Date().toISOString())}\n\nTPRFN Health Dashboard`;
        const testRecipients = [
          ...(cfg.email_recipients ?? []).map((r: string) => ({ r, channel: "email" })),
          ...(cfg.sms_recipients ?? []).map((r: string) => ({ r, channel: "sms" })),
        ];
        for (const { r, channel } of testRecipients) {
          try {
            await sendGmail(
              r,
              channel === "sms" ? "" : testSubject,
              channel === "sms" ? `TPRFN test: ${callsign} alerts working ${fmt(new Date().toISOString())}` : testBody,
            );
            await supabase.from("station_alert_events").insert({
              callsign, alert_type: "test", channel, recipient: r, status: "sent", last_heard_at: lastHeard,
            });
          } catch (e) {
            await supabase.from("station_alert_events").insert({
              callsign, alert_type: "test", channel, recipient: r, status: "failed",
              error_message: String(e), last_heard_at: lastHeard,
            });
          }
        }
        await supabase
          .from("station_alert_configs")
          .update({ last_alert_sent_at: new Date().toISOString() })
          .eq("id", cfg.id);
        results.push({ callsign, alertType: "test", recipients: testRecipients.length });
        continue;
      }

      let alertType: "down" | "recovery" | null = null;
      if (isDown && cfg.current_state !== "down") alertType = "down";
      if (!isDown && cfg.current_state === "down" && cfg.notify_recovery) alertType = "recovery";
      if (!isDown && cfg.current_state === "down" && !cfg.notify_recovery) {
        await supabase
          .from("station_alert_configs")
          .update({ current_state: "up" })
          .eq("id", cfg.id);
        continue;
      }
      if (!alertType) continue;

      const subject =
        alertType === "down"
          ? `[TPRFN] ${callsign} is DOWN`
          : `[TPRFN] ${callsign} is back online`;
      const body =
        alertType === "down"
          ? `Station ${callsign} has been silent for more than ${cfg.threshold_hours} hours.\n\nLast heard: ${fmt(lastHeard)}\nChecked: ${fmt(new Date().toISOString())}\n\nTPRFN Health Dashboard`
          : `Station ${callsign} is back on the air.\n\nLast heard: ${fmt(lastHeard)}\nChecked: ${fmt(new Date().toISOString())}\n\nTPRFN Health Dashboard`;

      const recipients = [
        ...(cfg.email_recipients ?? []).map((r: string) => ({ r, channel: "email" })),
        ...(cfg.sms_recipients ?? []).map((r: string) => ({ r, channel: "sms" })),
      ];

      for (const { r, channel } of recipients) {
        // SMS gateways choke on long bodies
        const smsBody =
          alertType === "down"
            ? `TPRFN: ${callsign} DOWN (${cfg.threshold_hours}h silent). Last heard ${fmt(lastHeard)}`
            : `TPRFN: ${callsign} back online ${fmt(lastHeard)}`;
        try {
          await sendGmail(r, channel === "sms" ? "" : subject, channel === "sms" ? smsBody : body);
          await supabase.from("station_alert_events").insert({
            callsign,
            alert_type: alertType,
            channel,
            recipient: r,
            status: "sent",
            last_heard_at: lastHeard,
          });
        } catch (e) {
          await supabase.from("station_alert_events").insert({
            callsign,
            alert_type: alertType,
            channel,
            recipient: r,
            status: "failed",
            error_message: String(e),
            last_heard_at: lastHeard,
          });
        }
      }

      await supabase
        .from("station_alert_configs")
        .update(
          alertType === "down"
            ? { current_state: "down", last_alert_sent_at: new Date().toISOString() }
            : { current_state: "up", last_recovery_sent_at: new Date().toISOString() }
        )
        .eq("id", cfg.id);

      results.push({ callsign, alertType, recipients: recipients.length });
    }

    return new Response(JSON.stringify({ checked: configs?.length ?? 0, alerts: results }), {
      headers: corsHeaders,
    });
  } catch (e) {
    console.error("check-station-alerts error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
