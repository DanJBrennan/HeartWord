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

import { createHash } from "node:crypto";

export const GEMINI_TEXT_MODEL = "gemini-3.6-flash";

// A JSON-Schema-like object, per Gemini's responseSchema (a restricted
// subset of OpenAPI schema: type/properties/items/required/enum/
// description). Left loosely typed since callers pass a literal object.
export type GeminiJsonSchema = Record<string, unknown>;

export async function generateJson<T>(prompt: string, schema: GeminiJsonSchema): Promise<T> {
  return generateJsonWithImages(prompt, [], schema);
}

/** generateJson plus token usage and an estimated cost, for a caller that
 *  records real spend -- see generateJsonWithImagesMetered. */
export async function generateJsonMetered<T>(prompt: string, schema: GeminiJsonSchema): Promise<GeminiMeteredResult<T>> {
  return generateJsonWithImagesMetered(prompt, [], schema);
}

// Public Gemini 3.6 Flash standard rates verified 2026-10-23 at
// https://ai.google.dev/gemini-api/docs/pricing (valid through 2026-12-31).
// This remains an estimate, not an invoice reconciliation. Historical
// ledger entries retain their original estimates; a production allowance
// accounts for uncertain earlier charges without rewriting those records.
// Output tokens include thinking tokens at the same output rate.
const GEMINI_TEXT_INPUT_USD_PER_MILLION_TOKENS = 0.75;
const GEMINI_TEXT_OUTPUT_USD_PER_MILLION_TOKENS = 3.75;

export interface GeminiUsage { promptTokenCount: number; candidatesTokenCount: number; thoughtsTokenCount: number; totalTokenCount: number }
export interface GeminiTextOptions { maxOutputTokens?: number; thinkingLevel?: "minimal" | "low" | "medium" | "high" }
export class GeminiResponseError extends Error {
  constructor(message:string, readonly receipt:{usage:GeminiUsage;costUsd:number;model:string;finishReason:string|null;rawText:string|null}) { super(message); this.name="GeminiResponseError"; }
}
export interface GeminiMeteredResult<T> { result: T; usage: GeminiUsage; costUsd: number }
export interface GeminiMediaInput {
  mimeType: string;
  data: string;
  fileUri?: never;
  caption?: string;
  /** Optional static video sampling; omitted inputs retain the provider default. */
  videoMetadata?: { fps: number };
}
/** Keep inline-only consumers (including Codex) on the original media type. */
export type GeminiRequestMediaInput = GeminiMediaInput | (Omit<GeminiMediaInput,"data"|"fileUri"> & {fileUri:string;data?:never});

export interface GeminiUploadedFile {
  name: string; uri: string; mimeType: string; sizeBytes: string;
  sha256Hash: string; state: "PROCESSING" | "ACTIVE" | "FAILED"; expirationTime: string;
}
export const GEMINI_JSON_REQUEST_LIMIT_BYTES = 20_000_000;
const fileNamePattern = /^files\/[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const fileUriPrefix = "https://generativelanguage.googleapis.com/v1beta/";
function fileName(name: string): string {
  if (!fileNamePattern.test(name)) throw new Error("Invalid Gemini uploaded file name.");
  return name;
}
function fileKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Explicit Gemini file API configuration required.");
  return key;
}
/** Verify server metadata against the exact local bytes, not a display name. */
export function verifyGeminiUploadedFile(value: unknown, expected: {sha256: string; mimeType: string; sizeBytes: number}): GeminiUploadedFile {
  const f = value as GeminiUploadedFile;
  if (!f || typeof f.name !== "string" || !fileNamePattern.test(f.name) || f.uri !== fileUriPrefix + f.name ||
      !Number.isSafeInteger(expected.sizeBytes) || expected.sizeBytes < 1 || expected.sizeBytes > 2_000_000_000 ||
      !/^[a-f0-9]{64}$/.test(expected.sha256) || f.mimeType !== expected.mimeType || f.sizeBytes !== String(expected.sizeBytes) ||
      typeof f.sha256Hash !== "string" || !["PROCESSING", "ACTIVE", "FAILED"].includes(f.state) ||
      !Number.isFinite(Date.parse(f.expirationTime)) || Date.parse(f.expirationTime) <= Date.now()) {
    throw new Error("Gemini uploaded file metadata does not match the retained media.");
  }
  let digest = f.sha256Hash;
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    if (digest.length > 88) throw new Error("Invalid Gemini uploaded file hash encoding.");
    const decoded = Buffer.from(digest,"base64");
    if (decoded.toString("base64") !== digest) throw new Error("Invalid Gemini uploaded file hash encoding.");
    // Files API has returned both raw digest bytes and an ASCII hex digest
    // inside the base64 JSON bytes field. Both must identify the SAME bytes.
    digest = decoded.length === 32 ? decoded.toString("hex") :
      decoded.length === 64 && /^[a-f0-9]{64}$/.test(decoded.toString("utf8")) ? decoded.toString("utf8") : "";
  }
  if (digest !== expected.sha256) throw new Error("Gemini uploaded file hash differs from retained media.");
  return {name:f.name, uri:f.uri, mimeType:f.mimeType, sizeBytes:f.sizeBytes, sha256Hash:f.sha256Hash, state:f.state, expirationTime:f.expirationTime};
}
/** Non-generative transport only. No retries, model selection or inference call. */
export async function uploadGeminiReviewFile(bytes: Uint8Array, mimeType: string, displayName: string): Promise<GeminiUploadedFile> {
  const key = fileKey();
  if (!bytes.byteLength || bytes.byteLength > 2_000_000_000 || !["video/mp4", "audio/wav", "audio/mpeg", "image/png", "image/jpeg"].includes(mimeType) || !displayName || displayName.length > 512) throw new Error("Invalid bounded review attachment.");
  const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method:"POST", redirect:"error", signal:AbortSignal.timeout(60000),
    headers:{"x-goog-api-key":key,"X-Goog-Upload-Protocol":"resumable","X-Goog-Upload-Command":"start","X-Goog-Upload-Header-Content-Length":String(bytes.byteLength),"X-Goog-Upload-Header-Content-Type":mimeType,"Content-Type":"application/json"},
    body:JSON.stringify({file:{displayName}})
  });
  if (!start.ok) throw new Error(`Gemini file upload initialization failed: ${start.status}`);
  const location = start.headers.get("x-goog-upload-url");
  const url = location ? new URL(location) : undefined;
  if (!url || url.protocol !== "https:" || url.hostname !== "generativelanguage.googleapis.com" || url.port || url.username || url.password || url.pathname !== "/upload/v1beta/files" || url.hash) throw new Error("Untrusted Gemini resumable upload destination.");
  const done = await fetch(url.href, {method:"POST", redirect:"error", signal:AbortSignal.timeout(180000),
    headers:{"Content-Length":String(bytes.byteLength),"X-Goog-Upload-Offset":"0","X-Goog-Upload-Command":"upload, finalize"},
    body:bytes});
  if (!done.ok) throw new Error(`Gemini file upload failed: ${done.status}`);
  return verifyGeminiUploadedFile((await done.json() as {file:unknown}).file, {sha256:createHash("sha256").update(bytes).digest("hex"),mimeType,sizeBytes:bytes.byteLength});
}
export async function getGeminiReviewFile(file: GeminiUploadedFile, expected: {sha256:string;mimeType:string;sizeBytes:number}): Promise<GeminiUploadedFile> {
  verifyGeminiUploadedFile(file, expected);
  const res = await fetch(fileUriPrefix + fileName(file.name), {headers:{"x-goog-api-key":fileKey()},redirect:"error",signal:AbortSignal.timeout(60000)});
  if (!res.ok) throw new Error(`Gemini file metadata failed: ${res.status}`);
  return verifyGeminiUploadedFile(await res.json(), expected);
}
export async function deleteGeminiReviewFile(file: GeminiUploadedFile): Promise<void> {
  if (file.uri !== fileUriPrefix + fileName(file.name)) throw new Error("Invalid Gemini uploaded file URI.");
  const res = await fetch(file.uri,{method:"DELETE",headers:{"x-goog-api-key":fileKey()},redirect:"error",signal:AbortSignal.timeout(60000)});
  if (!res.ok && res.status !== 404) throw new Error(`Gemini file deletion failed: ${res.status}`);
}

/** Also used before the review journal reserves a potentially billable call. */
export function geminiJsonRequestBody(prompt: string, images: GeminiRequestMediaInput[], schema: GeminiJsonSchema, options: GeminiTextOptions = {}): string {
  const parts = [{text:prompt}, ...images.flatMap(img => {
    const inline = typeof img.data === "string" && img.data.length > 0;
    if (inline === (img.fileUri !== undefined) || (!inline && img.data !== undefined) ||
        (img.fileUri !== undefined && (!img.fileUri.startsWith(fileUriPrefix) || !fileNamePattern.test(img.fileUri.slice(fileUriPrefix.length))))) throw new Error("Gemini media requires exactly one inline payload or verified file URI.");
    return [...(img.caption ? [{text:img.caption}] : []), {
      ...(img.fileUri ? {fileData:{mimeType:img.mimeType,fileUri:img.fileUri}} : {inlineData:{mimeType:img.mimeType,data:img.data}}),
      ...(img.videoMetadata ? {videoMetadata:img.videoMetadata} : {})
    }];
  })];
  const body = JSON.stringify({contents:[{role:"user",parts}],generationConfig:{temperature:0.4,responseMimeType:"application/json",responseSchema:schema,
    ...(options.maxOutputTokens === undefined ? {} : {maxOutputTokens:options.maxOutputTokens}),
    ...(options.thinkingLevel === undefined ? {} : {thinkingConfig:{thinkingLevel:options.thinkingLevel.toUpperCase()}})}});
  if (Buffer.byteLength(body,"utf8") > GEMINI_JSON_REQUEST_LIMIT_BYTES) throw new Error("Gemini encoded request exceeds 20 MB; attach verified media through the Files API.");
  return body;
}

function estimateGeminiTextCostUsd(usage: GeminiUsage, model=GEMINI_TEXT_MODEL): number {
  // Standard rates verified 2026-10-31 against ai.google.dev/gemini-api/docs/pricing.
  // Do not price Pro alignment fills at Flash rates or rewrite historical costs.
  const pro=model==="gemini-3.1-pro-preview",long=usage.promptTokenCount>200000;
  const inputRate=pro?(long?4:2):GEMINI_TEXT_INPUT_USD_PER_MILLION_TOKENS;
  const outputRate=pro?(long?18:12):GEMINI_TEXT_OUTPUT_USD_PER_MILLION_TOKENS;
  const inputCost = usage.promptTokenCount * inputRate / 1_000_000;
  const outputCost = (usage.candidatesTokenCount + usage.thoughtsTokenCount) * outputRate / 1_000_000;
  return Math.round((inputCost + outputCost) * 1e6) / 1e6;
}

async function callGemini<T>(
  prompt: string,
  images: GeminiRequestMediaInput[],
  schema: GeminiJsonSchema,
  model: string,
  options: GeminiTextOptions = {}
): Promise<GeminiMeteredResult<T>> {
  if (![GEMINI_TEXT_MODEL,"gemini-3.1-pro-preview"].includes(model)) throw new Error("Gemini reasoning held: model pricing must be verified before a new paid model is enabled.");
  if (options.maxOutputTokens !== undefined && (!Number.isSafeInteger(options.maxOutputTokens) || options.maxOutputTokens < 16 || options.maxOutputTokens > 8192)) throw new Error("Bounded Gemini output must be 16–8192 tokens.");
  if (options.thinkingLevel !== undefined && (!["minimal","low","medium","high"].includes(options.thinkingLevel) || (model === "gemini-3.1-pro-preview" && options.thinkingLevel === "minimal"))) throw new Error("Unsupported bounded thinking level for this Gemini model.");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env (see .env.example) -- this calls Gemini for stage 3's " +
        "casting/direction planning pass."
    );
  }

  // A caption becomes its own text part immediately before its image --
  // Gemini's inlineData parts carry no label of their own, so a caller
  // sending several images (e.g. one per chapter character) has no other
  // way to tell the model which is which.
  const body = geminiJsonRequestBody(prompt, images, schema, options);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(180000),
    headers: { "Content-Type": "application/json" },
    body
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini generateContent failed: ${res.status} ${res.statusText} -- ${body}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?:string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number };
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const usage: GeminiUsage = {
    promptTokenCount: data.usageMetadata?.promptTokenCount ?? 0,
    candidatesTokenCount: data.usageMetadata?.candidatesTokenCount ?? 0,
    thoughtsTokenCount: data.usageMetadata?.thoughtsTokenCount ?? 0,
    totalTokenCount: data.usageMetadata?.totalTokenCount ?? 0
  };
  const costUsd = estimateGeminiTextCostUsd(usage,model);

  const receipt={usage,costUsd,model,finishReason:data.candidates?.[0]?.finishReason??null,rawText:text??null};
  if(!text)throw new GeminiResponseError("Gemini returned no final text; usage retained for reconciliation.",receipt);
  try {
    return { result: JSON.parse(text) as T, usage, costUsd };
  } catch (err) {
    throw new GeminiResponseError(`Gemini's response wasn't valid JSON despite responseSchema: ${(err as Error).message}`,receipt);
  }
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
  images: GeminiMediaInput[],
  schema: GeminiJsonSchema,
  model = GEMINI_TEXT_MODEL
): Promise<T> {
  return (await callGemini<T>(prompt, images, schema, model)).result;
}

/**
 * Same call as generateJsonWithImages, but also returns token usage and an
 * estimated USD cost -- for a caller that needs to record real spend (the
 * production crew; see production_events.cost_usd and cost_ledger_entries
 * in crew-store.ts). A separate function rather than changing
 * generateJsonWithImages's return shape, since that would force every
 * existing caller (canonical-likeness, critic, scene-fidelity, soundtrack
 * review, alignment identification) to unwrap a `.result` it doesn't need.
 */
export async function generateJsonWithImagesMetered<T>(
  prompt: string,
  images: GeminiRequestMediaInput[],
  schema: GeminiJsonSchema,
  model = GEMINI_TEXT_MODEL,
  options: GeminiTextOptions = {}
): Promise<GeminiMeteredResult<T>> {
  return callGemini<T>(prompt, images, schema, model, options);
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
 *
 * Returns the real grounding provenance (`groundingMetadata`) alongside
 * the text, not just the prose -- previously discarded entirely, so a
 * research claim ("archaeological evidence shows...") had no attached
 * source a producer could actually go check. `sources` are the cited web
 * pages Gemini's search grounding actually retrieved; `searchQueries` are
 * the literal queries it ran. Both default to an empty array rather than
 * throwing when a response has no grounding metadata (e.g. the model
 * answered from its own knowledge without needing to search).
 */
export interface GroundingSource {
  title: string;
  uri: string;
}

export interface GroundedTextResult {
  text: string;
  sources: GroundingSource[];
  searchQueries: string[];
  /** Estimated cost of this call, from Gemini's own reported usage --
   *  grounded search is the most expensive call this project makes, and
   *  a caller recording spend should not have to guess at it. */
  costUsd: number;
}

export async function generateGroundedText(
  prompt: string,
  images: Array<{ mimeType: string; data: string }> = []
): Promise<GroundedTextResult> {
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
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: {
        webSearchQueries?: string[];
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      };
    }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number };
  };
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) {
    throw new Error(`Gemini's grounded search call returned no text: ${JSON.stringify(data).slice(0, 500)}`);
  }

  const sources: GroundingSource[] = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .map((chunk) => chunk.web)
    .filter((web): web is { uri: string; title?: string } => !!web?.uri)
    .map((web) => ({ uri: web.uri, title: web.title ?? web.uri }));
  const searchQueries = candidate?.groundingMetadata?.webSearchQueries ?? [];
  const costUsd = estimateGeminiTextCostUsd({
    promptTokenCount: data.usageMetadata?.promptTokenCount ?? 0,
    candidatesTokenCount: data.usageMetadata?.candidatesTokenCount ?? 0,
    thoughtsTokenCount: data.usageMetadata?.thoughtsTokenCount ?? 0,
    totalTokenCount: data.usageMetadata?.totalTokenCount ?? 0
  });

  return { text, sources, searchQueries, costUsd };
}
