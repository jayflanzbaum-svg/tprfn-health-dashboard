// deno-lint-ignore-file no-explicit-any
// Sends one SMS through Twilio and logs every attempt. Never throws silently.
export async function smsEnabled(db: any): Promise<boolean> {
  const { data } = await db.from("app_settings").select("value").eq("key", "sms_sending_enabled").maybeSingle();
  return data?.value === true;
}

export async function sendSms(
  db: any,
  opts: { phone: string; hub: string | null; type: string; body: string; ip?: string | null },
): Promise<{ ok: boolean; status: string; sid?: string; error?: string }> {
  const log = (status: string, extra: Record<string, unknown> = {}) =>
    db.from("sms_log").insert({
      direction: "outbound", phone: opts.phone, hub_callsign: opts.hub, message_type: opts.type,
      body: opts.body, status, ip: opts.ip ?? null, ...extra,
    });

  if (!(await smsEnabled(db))) {
    await log("blocked_pending_approval", { error_message: "Text alerts pending carrier approval" });
    return { ok: false, status: "pending_approval", error: "Text alerts pending carrier approval" };
  }
  const sidAcct = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM");
  if (!sidAcct || !token || !from) {
    await log("failed", { error_message: "Twilio secrets missing" });
    return { ok: false, status: "failed", error: "Twilio secrets missing" };
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sidAcct}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sidAcct}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: opts.phone, From: from, Body: opts.body }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`Twilio send failed [${res.status}]: ${text}`);
      await log("failed", { error_message: `[${res.status}] ${text}`.slice(0, 2000) });
      return { ok: false, status: "failed", error: `[${res.status}] ${text}` };
    }
    const sid = JSON.parse(text).sid as string;
    await log("sent", { twilio_sid: sid });
    return { ok: true, status: "sent", sid };
  } catch (e) {
    console.error("Twilio send error", e);
    await log("failed", { error_message: String(e) });
    return { ok: false, status: "failed", error: String(e) };
  }
}
