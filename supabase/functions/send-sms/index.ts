// Adds a pending text-alert recipient (public self sign-up or admin) and sends one confirmation text.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { toE164, msg } from "../_shared/sms.ts";
import { sendSms } from "../_shared/twilio.ts";

const Body = z.object({
  hub: z.string().trim().min(3).max(12),
  phone: z.string().trim().min(10).max(20),
  name: z.string().trim().max(80).optional(),
  consent: z.boolean().optional(),
});
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { hub: rawHub, phone: rawPhone, name, consent } = parsed.data;
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Signed-in admin adds on someone's behalf; otherwise it's a self sign-up that needs consent.
    let requestedBy = "self";
    const auth = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (auth) {
      const { data } = await db.auth.getUser(auth);
      if (data?.user) requestedBy = data.user.email ?? data.user.id;
    }
    if (requestedBy === "self" && consent !== true) return json({ error: "Consent checkbox is required" }, 400);

    const phone = toE164(rawPhone);
    if (!phone) return json({ error: "Enter a 10-digit US/Canada mobile number" }, 400);
    const hub = rawHub.toUpperCase().replace(/-[0-9A-Z]+$/, "");
    const { data: hubRow } = await db.from("hub_profiles").select("id").eq("is_active", true).ilike("base_callsign", hub).limit(1);
    if (!hubRow?.length) return json({ error: "Unknown hub" }, 400);

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count: phoneCount } = await db.from("sms_log").select("id", { count: "exact", head: true })
      .eq("phone", phone).eq("message_type", "confirm").gte("created_at", dayAgo);
    if ((phoneCount ?? 0) >= 3) return json({ error: "Too many sign-ups for this number today. Try again tomorrow." }, 429);
    if (requestedBy === "self" && ip) {
      const { count: ipCount } = await db.from("sms_log").select("id", { count: "exact", head: true })
        .eq("ip", ip).eq("message_type", "confirm").gte("created_at", hourAgo);
      if ((ipCount ?? 0) >= 5) return json({ error: "Too many sign-ups from this connection. Try again in an hour." }, 429);
    }

    const { data: existing } = await db.from("sms_recipients").select("status").eq("hub_callsign", hub).eq("phone", phone).maybeSingle();
    if (existing?.status === "active") return json({ status: "already_active" });

    const { error: upErr } = await db.from("sms_recipients").upsert({
      hub_callsign: hub, phone, name: name || null, status: "pending",
      requested_at: new Date().toISOString(), requested_by: requestedBy, confirmed_at: null, opted_out_at: null,
    }, { onConflict: "hub_callsign,phone" });
    if (upErr) throw upErr;

    const sent = await sendSms(db, { phone, hub, type: "confirm", body: msg.confirm(hub), ip });
    return json({ status: "pending", send: sent.status, error: sent.ok ? undefined : sent.error });
  } catch (e) {
    console.error("send-sms error", e);
    return json({ error: String(e) }, 500);
  }
});
