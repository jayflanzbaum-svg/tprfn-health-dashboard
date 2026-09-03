import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You extract amateur radio hub station details from a TPRFN Hub Station Fact Sheet.
Return ONLY the tool call with the structured data. Rules:
- base_callsign: the station callsign without SSID, uppercase.
- ssid: only if the fact sheet's primary station uses one, digits only, else null.
- operator: sysop name (plus contact if present).
- city/state/country: from the location line. Expand state abbreviations to two-letter codes; country "USA" unless clearly otherwise.
- frequencies: every operating/scanning frequency in MHz. transport is one of vara-hf, vara-fm, ax25, ardop, pactor, packet, other (HF frequencies below 30 MHz with VARA are vara-hf). modem is e.g. VARA, VARA FM, AX.25. mode is USB for HF data, FM for VHF/UHF.
- Scan times are PER FREQUENCY: put each frequency's scanning/monitoring schedule in that frequency's scan_times field (e.g. "24/7", "0000-1200Z daily"), plain text under 200 characters, null if not stated for that frequency. If the sheet gives one schedule covering several frequencies, repeat it on each of those frequencies.
- scan_times (top level): only an overall schedule note if one exists that is not tied to a specific frequency, else null.
- notes: concise summary of services, schedule, equipment, and scanning times. Keep it under 600 characters, plain text.
- Omit fields you cannot determine (use null).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return new Response(JSON.stringify({ error: "A valid PDF url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pdfRes = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/pdf,*/*",
      },
    });
    if (!pdfRes.ok) {
      return new Response(
        JSON.stringify({ error: `Could not download the PDF (HTTP ${pdfRes.status})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const bytes = new Uint8Array(await pdfRes.arrayBuffer());
    const doc = await getDocumentProxy(bytes);
    const { text } = await extractText(doc, { mergePages: true });
    const pdfText = (text || "").trim();
    if (pdfText.length < 20) {
      return new Response(JSON.stringify({ error: "No readable text found in that PDF" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: pdfText.slice(0, 20000) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_hub_profile",
              description: "Structured hub station profile extracted from the fact sheet",
              parameters: {
                type: "object",
                properties: {
                  base_callsign: { type: "string" },
                  ssid: { type: ["string", "null"] },
                  operator: { type: ["string", "null"] },
                  city: { type: ["string", "null"] },
                  state: { type: ["string", "null"] },
                  country: { type: ["string", "null"] },
                  network: { type: ["string", "null"] },
                  notes: { type: ["string", "null"] },
                  scan_times: { type: ["string", "null"] },
                  frequencies: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        freq_mhz: { type: "number" },
                        mode: { type: "string" },
                        transport: { type: "string" },
                        modem: { type: "string" },
                        scan_times: { type: ["string", "null"] },
                      },
                      required: ["freq_mhz", "mode", "transport", "modem", "scan_times"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["base_callsign", "frequencies"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_hub_profile" } },
      }),
    });

    if (aiRes.status === 429 || aiRes.status === 402) {
      return new Response(
        JSON.stringify({
          error: aiRes.status === 429 ? "AI rate limit reached, try again shortly" : "AI credits exhausted",
        }),
        { status: aiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiRes.ok) {
      const detail = await aiRes.text();
      console.error("AI gateway error", aiRes.status, detail);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Could not read station details from that PDF" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profile = JSON.parse(call.function.arguments);
    return new Response(JSON.stringify({ profile, source_text: pdfText.slice(0, 4000) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("import-hub-pdf error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
