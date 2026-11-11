// Twilio Messaging webhook: verifies X-Twilio-Signature, handles YES/START, STOP words, HELP/INFO.
import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyReply, msg, twilioSignature } from "../_shared/sms.ts";

const twiml = (text?: string) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${text ? `<Message>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</Message>` : ""}</Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!token) return new Response("Not configured", { status: 500 });

  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(await req.text())) params[k] = v;
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sms-inbound${new URL(req.url).search}`;
  const expected = await twilioSignature(token, url, params);
  if (req.headers.get("X-Twilio-Signature") !== expected) {
    console.error("sms-inbound: bad signature");
    return new Response("Forbidden", { status: 403 });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const phone = params.From ?? "";
  const body = params.Body ?? "";
  const kind = classifyReply(body);
  const now = new Date().toISOString();
  await db.from("sms_log").insert({
    direction: "inbound", phone, message_type: `reply_${kind}`, body, status: "received", twilio_sid: params.MessageSid ?? null,
  });

  if (kind === "yes") {
    // START re-subscribes previously opted-out rows as well as confirming pending ones
    const statuses = body.trim().toUpperCase() === "START" ? ["pending", "opted_out"] : ["pending"];
    const { data: rows } = await db.from("sms_recipients").update({ status: "active", confirmed_at: now, opted_out_at: null })
      .eq("phone", phone).in("status", statuses).select("hub_callsign");
    const { data: all } = await db.from("sms_recipients").select("hub_callsign").eq("phone", phone).eq("status", "active");
    const calls = [...new Set((all ?? []).map((r) => r.hub_callsign))].sort();
    if (!calls.length) return twiml();
    const reply = msg.subscribed(calls);
    await db.from("sms_log").insert({ direction: "outbound", phone, message_type: "subscribed", body: reply, status: "sent_twiml", hub_callsign: rows?.[0]?.hub_callsign ?? null });
    return twiml(reply);
  }
  if (kind === "stop") {
    await db.from("sms_recipients").update({ status: "opted_out", opted_out_at: now }).eq("phone", phone).neq("status", "opted_out");
    return twiml(); // Twilio sends the carrier STOP confirmation itself
  }
  if (kind === "help") {
    const reply = msg.help();
    await db.from("sms_log").insert({ direction: "outbound", phone, message_type: "help", body: reply, status: "sent_twiml" });
    return twiml(reply);
  }
  return twiml();
});
