import { describe, it, expect } from "bun:test";
import { toE164, classifyReply, msg, twilioSignature } from "./sms";

describe("sms rules", () => {
  it("stores US numbers in E.164", () => {
    expect(toE164("(413) 221-8709")).toBe("+14132218709");
    expect(toE164("1-413-221-8709")).toBe("+14132218709");
    expect(toE164("221-8709")).toBeNull();
  });
  it("YES and START confirm", () => {
    expect(classifyReply(" yes ")).toBe("yes");
    expect(classifyReply("Start")).toBe("yes");
  });
  it("all carrier stop words opt out", () => {
    for (const w of ["STOP", "stopall", "Unsubscribe", "cancel", "END", "quit"]) expect(classifyReply(w)).toBe("stop");
  });
  it("HELP and INFO get help; other text gets nothing", () => {
    expect(classifyReply("help")).toBe("help");
    expect(classifyReply("INFO")).toBe("help");
    expect(classifyReply("hello there")).toBe("other");
  });
  it("alert texts stay under 160 characters", () => {
    expect(msg.down("KA3VSP", 72, "2026-11-10T18:42:00Z").length).toBeLessThan(160);
    expect(msg.recovery("KA3VSP", "2026-11-10T18:42:00Z").length).toBeLessThan(160);
  });
  it("matches Twilio's documented signature example", async () => {
    const sig = await twilioSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", {
      CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212",
    });
    expect(sig).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
  });
});
