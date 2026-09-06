/**
 * Gemini client for stage 3 (casting & direction)'s single-pass planning
 * call -- see docs/ARCHITECTURE.md's "v1 simplification" callout and
 * src/pipeline/casting/index.ts. This is a text-in/JSON-out reasoning
 * call, not the image/video generation PRODUCT_VISION.md's Generation
 * Providers section describes for GEMINI_API_KEY (Nano Banana, Veo,
 * Gemini Omni) -- same key, different model/endpoint.
 *
 * Model choice: gemini-2.5-flash -- the documented, stable "best price-
 * performance for reasoning" tier as of when this was written. Newer
 * model names may exist by the time this runs; swap GEMINI_TEXT_MODEL
 * below if Dan wants a different one; kept as one constant for that
 * reason rather than scattered through casting/index.ts.
 */

export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";

// A JSON-Schema-like object, per Gemini's responseSchema (a restricted
// subset of OpenAPI schema: type/properties/items/required/enum/
// description). Left loosely typed since callers pass a literal object.
export type GeminiJsonSchema = Record<string, unknown>;

export async function generateJson<T>(prompt: string, schema: GeminiJsonSchema): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env (see .env.example) -- this calls Gemini for stage 3's " +
        "casting/direction planning pass."
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
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
