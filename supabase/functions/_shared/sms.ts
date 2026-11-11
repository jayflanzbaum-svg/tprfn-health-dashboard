// Pure SMS helpers shared by send-sms, sms-inbound and check-station-alerts.
export const SUPPORT_EMAIL = "jayflanzbaum@gmail.com";

export function toE164(input: string): string | null {
  const d = (input || "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

export type Keyword = "yes" | "stop" | "help" | "other";
export function classifyReply(body: string): Keyword {
  const w = (body || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (w === "YES" || w === "START") return "yes";
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(w)) return "stop";
  if (w === "HELP" || w === "INFO") return "help";
  return "other";
}

const utc = (ts: string | null) =>
  ts ? `${new Date(ts).toISOString().replace("T", " ").slice(0, 16)}Z` : "unknown";

export const msg = {
  confirm: (call: string) =>
    `TPRFN: Reply YES to get down/recovery alerts for hub ${call}. Msg freq varies, about 1-10/mo. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`,
  subscribed: (calls: string[]) =>
    `TPRFN: You're subscribed to alerts for ${calls.join(", ")}. Reply STOP to opt out.`,
  help: () =>
    `TPRFN hub alerts: down/recovery notices for amateur radio hub stations you signed up for. Msg freq varies, about 1-10/mo. Msg & data rates may apply. Help: ${SUPPORT_EMAIL}. Reply STOP to cancel.`,
  down: (call: string, hours: number, lastHeard: string | null) =>
    `TPRFN: Hub ${call} has not connected to another hub for ${hours} ${hours === 1 ? "hour" : "hours"} (last heard ${utc(lastHeard)}). Reply STOP to opt out.`,
  recovery: (call: string, lastHeard: string | null) =>
    `TPRFN: Hub ${call} is back (heard ${utc(lastHeard)}). Reply STOP to opt out.`,
  test: (call: string) => `TPRFN test: ${call} alerts working ${utc(new Date().toISOString())}. Reply STOP to opt out.`,
};

// Twilio request signature: base64(HMAC-SHA1(authToken, url + sorted key+value pairs))
export async function twilioSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
