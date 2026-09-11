/**
 * Gemini client for stage 3 (casting & direction)'s single-pass planning
 * call -- see docs/ARCHITECTURE.md's "v1 simplification" callout and
 * src/pipeline/casting/index.ts -- and for
 * src/pipeline/qc/canonical-likeness.ts's automated likeness check. Both
 * are text/JSON reasoning calls (optionally with image input, for the
 * likeness check), not the image/video *generation* PRODUCT_VISION.md's
 * Generation Providers section describes for GEMINI_API_KEY (Nano Banana,
 * Veo, Gemini Omni, in src/providers/gemini/index.ts) -- same key,
 * different model/endpoint.
 *
 * Model choice: gemini-3.6-flash. The original choice, gemini-2.5-flash,
 * turned out to already be retired for new API keys by the time Dan
 * actually ran this (2026-09-06) -- Gemini's own 404 response named
 * gemini-3.6-flash as the replacement, which is what's live here. Model
 * names keep moving; swap GEMINI_TEXT_MODEL below rather than scattering
 * the string through casting/index.ts if this one gets retired too.
 */

export const GEMINI_TEXT_MODEL = "gemini-3.6-flash";

// A JSON-Schema-like object, per Gemini's responseSchema (a restricted
// subset of OpenAPI schema: type/properties/items/required/enum/
// description). Left loosely typed since callers pass a literal object.
export type GeminiJsonSchema = Record<string, unknown>;

export async function generateJson<T>(prompt: string, schema: GeminiJsonSchema): Promise<T> {
  return generateJsonWithImages(prompt, [], schema);
}

/**
 * Same text-in/JSON-out shape as generateJson, plus optional image inputs
 * -- used by src/pipeline/qc/canonical-likeness.ts's automated canon-
 * likeness check (comparing a character's approved reference image
 * against a generated shot), which needs the model to actually see both
 * images, not just read a text description of them. Same
 * gemini-3.6-flash model as the text-only path -- Gemini's flash line is
 * natively multimodal, confirmed working 2026-09-06 when this was added.
 */
export async function generateJsonWithImages<T>(
  prompt: string,
  images: Array<{ mimeType: string; data: string }>,
  schema: GeminiJsonSchema
): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env (see .env.example) -- this calls Gemini for stage 3's " +
        "casting/direction planning pass."
    );
  }

  const parts = [{ text: prompt }, ...images.map((img) => ({ inlineData: img }))];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(180000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: schema
      }
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini generateContent failed: ${res.status} ${res.statusText} -- ${body}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini returned no text in its response: ${JSON.stringify(data)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`Gemini's response wasn't valid JSON despite responseSchema: ${(err as Error).message} -- raw: ${text}`);
  }
}

/**
 * Free-text research call grounded in real live web search (Gemini's
 * native `google_search` tool), not just the model's own training data --
 * built for src/pipeline/qc/critic.ts, which needs to check a shot against
 * real historical/archaeological/biblical-scholarship facts (e.g. "how
 * tall were first-century Capernaum houses"), not whatever a model
 * remembers. Confirmed working 2026-09-06 by testing directly against the
 * live API: a grounded call about Capernaum roof heights returned cited,
 * specific archaeological sources (Loffreda's excavation reports), not a
 * vague generality.
 *
 * Optional image input -- confirmed 2026-09-06 that search grounding and
 * an inlineData image part DO combine in one call (unlike grounding and
 * `responseSchema`/JSON mode, which don't reliably combine -- see below).
 * Added when the Critic's scope grew from pure text-based scriptural/
 * historical review to also judging a generated keyframe's own physical/
 * staging plausibility as a video starting frame -- that needs the model
 * to actually see the image, not just read the shot's text plan.
 *
 * Text-only response, not JSON -- Gemini's `tools` (search grounding) and
 * `responseSchema`/JSON mode don't reliably combine in one call, so the
 * critic asks for a structured verdict in a SEPARATE, ungrounded
 * generateJson call afterward, handing this research text in as context.
 */
export async function generateGroundedText(
  prompt: string,
  images: Array<{ mimeType: string; data: string }> = []
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env (see .env.example).");
  }

  const parts = [{ text: prompt }, ...images.map((img) => ({ inlineData: img }))];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      tools: [{ google_search: {} }]
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini grounded search call failed: ${res.status} ${res.statusText} -- ${body}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) {
    throw new Error(`Gemini's grounded search call returned no text: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return text;
}
