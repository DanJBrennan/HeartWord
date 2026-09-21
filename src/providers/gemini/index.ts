/**
 * Google Gemini adapter: Nano Banana / Nano Banana Pro (ImageProvider),
 * Veo 3.1 Lite (VideoProvider), and Gemini Omni 1.1 (DraftVideoProvider +
 * ImageEditor) — one vendor family, one adapter module, per "Confirmed v1
 * providers" in docs/ARCHITECTURE.md. Authenticated with GEMINI_API_KEY
 * (see .env.example).
 *
 * ImageProvider.generate() and VideoProvider.generateFinal() are
 * implemented for real (2026-09-06). ImageEditor and DraftVideoProvider
 * were implemented for real 2026-09-09, after confirming their actual API
 * shape empirically (never assume a scraped doc is exactly right) --
 * three real findings from that confirmation pass, all load-bearing:
 *
 * 1. Omni 1.1 does NOT live behind the same `models/<id>:generateContent`
 *    REST shape every other model here uses -- calling it that way fails
 *    with "This model only supports Interactions API." It's a genuinely
 *    different, newer endpoint: `POST /v1beta/interactions` (note: NOT
 *    `/v1beta2/interactions`, which 404s despite that being what public
 *    docs describe -- confirmed by testing both directly).
 * 2. `gemini-omni-1.1-flash` is video-only in practice: asking it for
 *    `response_format: {type: "image"}` doesn't error, it just silently
 *    ignores the request and returns video anyway (confirmed with a real
 *    call, including a prompt explicitly saying "output a single still
 *    image, not a video" -- still got video back). So Omni handles
 *    generateDraft/generateGuided, but NOT editRegion.
 * 3. The targeted image-region-edit capability PRODUCT_VISION.md
 *    describes actually belongs to the Nano Banana family models, called
 *    through this SAME new Interactions endpoint (not the older
 *    generateContent call GeminiImageProvider above uses) -- confirmed
 *    with a real edit-only-the-background call against both
 *    gemini-3.1-flash-image and gemini-3-pro-image, both of which
 *    honored `response_format: {type: "image"}` correctly and left the
 *    rest of the image genuinely unchanged. Also confirmed empirically:
 *    the image response_format needs `mime_type: "image/jpeg"` (png is
 *    rejected) and must NOT set `delivery` at all (setting it to
 *    "inline" -- the value that works for video -- errors with "Image
 *    delivery mode is not supported").
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import { sceneReferenceAssetsForVerse } from "../story-state-assets.js";
import type {
  AssetRef,
  CharacterRef,
  DraftVideoProvider,
  GenerationResult,
  ImageEditor,
  ImageProvider,
  ShotRequest,
  VideoProvider
} from "../types.js";

function requireApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set (see .env.example).");
  }
  return key;
}

// Nano Banana / Nano Banana Pro model names -- confirmed against the live
// Gemini API's own model list 2026-09-06 (gemini-2.5-flash-image is listed
// with displayName "Nano Banana", gemini-3-pro-image with "Nano Banana
// Pro") while building the character-canon candidate images this same day
// -- see scripts/character-tool/generate-scribe-candidates.ts. Per
// docs/ARCHITECTURE.md's Provider interface: tier "pro" -> Pro, default ->
// standard.
const NANO_BANANA_MODEL = "gemini-2.5-flash-image";
const NANO_BANANA_PRO_MODEL = "gemini-3-pro-image";

// Rough public-pricing-based estimates, NOT reconciled against a real
// invoice. PRODUCT_VISION.md's Cost Governance wants every generation
// attempt's cost tracked, and a rough number here is better than silently
// recording $0 -- replace with a verified figure once real billing data is
// available.
const NANO_BANANA_COST_USD = 0.04;
const NANO_BANANA_PRO_COST_USD = 0.24;

interface ReferenceAssetRow {
  category: string;
  path: string;
  story_state?: string | null;
  available_from_verse?: string | null;
  available_through_verse?: string | null;
  asset_role?: string | null;
}

interface CharacterReferenceImages {
  characterName: string;
  images: Array<{ mimeType: string; data: string }>;
}

/**
 * Loads up to TWO reference images per character (a headshot/turnaround
 * plus a distinct body-pose image, when both exist) so the generated shot
 * keeps that character's approved likeness rather than drifting toward a
 * more generic face -- the "consistent appearance across shots" need
 * docs/design/media-generation.md flags as still open.
 *
 * Revised 2026-09-06 after Dan caught real likeness drift in Jesus's
 * generated keyframes (most visible in a wide shot, where his face read
 * noticeably more generic/Mediterranean than his canon headshot while
 * surrounding cast members kept their correct likeness) -- the original
 * version of this function attached only ONE reference image per
 * character, which wasn't enough to lock a specific face under Gemini's
 * own generative pull toward a more generic prior, especially at a wider
 * angle or on a named individual (as opposed to a group member, where
 * some variation is expected). See src/pipeline/qc/canonical-likeness.ts
 * for the automated check this drift is now caught by going forward.
 */
function loadCharacterReferenceImages(characters: ShotRequest["characters"]): CharacterReferenceImages[] {
  const db = getDb();
  const dataDir = getDataDir();
  const findAssets = db.prepare(
    `SELECT category, path, story_state, available_from_verse, available_through_verse, asset_role FROM character_assets
     WHERE character_version_id = ?
     ORDER BY CASE category WHEN 'headshot' THEN 0 WHEN 'body_pose' THEN 1 WHEN 'turnaround' THEN 2 ELSE 3 END,
       CASE asset_role WHEN 'base_pose' THEN 0 WHEN 'story_state_pose' THEN 1 ELSE 2 END, path`
  );
  const findName = db.prepare(
    `SELECT c.name FROM characters c JOIN character_versions cv ON cv.character_id = c.id WHERE cv.id = ?`
  );

  const result: CharacterReferenceImages[] = [];
  for (const character of characters) {
    let rows = sceneReferenceAssetsForVerse(findAssets.all(character.characterVersionId) as unknown as ReferenceAssetRow[], character.storyVerseRef);
    const nameRow = findName.get(character.characterVersionId) as { name: string } | undefined;
    const characterName = nameRow?.name ?? "this character";

    // 'turnaround' is a multi-panel design-reference SHEET (front/side/
    // back/headshot/action poses composited into one image, used for the
    // Mark 2 crowd witnesses and scribes), not a single clean pose --
    // built 2026-09-08 after attaching several of these sheets as shot
    // references produced collage-fragment artifacts in the generated
    // shot (a piece of the reference sheet's own multi-panel layout
    // bleeding into the output) and appeared to crowd out attention to
    // the rest of the prompt. Exclude it entirely whenever this character
    // has any single-pose asset (headshot/body_pose) instead -- only fall
    // back to the turnaround sheet if it's truly all that exists.
    const hasSinglePose = rows.some((r) => r.category !== "turnaround");
    if (hasSinglePose) {
      rows = rows.filter((r) => r.category !== "turnaround");
    }

    // First asset (headshot/body_pose), plus one more from a DIFFERENT
    // category if available -- two distinct views anchor a face far
    // better than one, without attaching every pose on file.
    const chosen: ReferenceAssetRow[] = [];
    for (const row of rows) {
      if (chosen.length === 0 || row.category !== chosen[0]!.category) {
        chosen.push(row);
      }
      if (chosen.length === 2) break;
    }

    const images: Array<{ mimeType: string; data: string }> = [];
    for (const row of chosen) {
      const absPath = join(dataDir, "assets", row.path);
      if (!existsSync(absPath)) continue;
      images.push({ mimeType: "image/png", data: readFileSync(absPath).toString("base64") });
    }
    if (images.length > 0) {
      result.push({ characterName, images });
    }
  }
  return result;
}

export class GeminiImageProvider implements ImageProvider {
  async generate(request: ShotRequest, opts?: { tier?: "standard" | "pro" }): Promise<GenerationResult> {
    const apiKey = requireApiKey();
    const tier = opts?.tier ?? "standard";
    const model = tier === "pro" ? NANO_BANANA_PRO_MODEL : NANO_BANANA_MODEL;
    const costUsd = tier === "pro" ? NANO_BANANA_PRO_COST_USD : NANO_BANANA_COST_USD;

    const referenceImages = loadCharacterReferenceImages(request.characters);
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: request.prompt }
    ];
    // Label each character's reference image(s) by name right before them,
    // rather than dumping every image anonymously at the end -- binds
    // identity to image far more reliably, and the explicit "lock this
    // exact face" instruction is what the original single-image version
    // of this method was missing (see loadCharacterReferenceImages' own
    // comment for the real drift this caused).
    //
    // Explicitly stating "ONE person, multiple angles" was added 2026-09-06
    // after Dan caught a real duplication bug: attaching two reference
    // images of the same character (the fix for likeness drift, above) had
    // its own failure mode -- Nano Banana sometimes rendered TWO people in
    // the scene, one matching each reference image, instead of reading
    // them as two views of one person. A shot's own character list already
    // says how many times a name appears; this line stops the model from
    // inventing an extra instance from the reference images themselves.
    for (const ref of referenceImages) {
      const multiImageNote =
        ref.images.length > 1
          ? ` These ${ref.images.length} images are DIFFERENT ANGLES/POSES OF THE SAME SINGLE PERSON, not different people -- ${ref.characterName} must appear only as many times in the final shot as the character list below says, never once per reference image.`
          : "";
      parts.push({
        text: `Reference image(s) for ${ref.characterName} -- this is the EXACT face, build, and likeness to use for ${ref.characterName} in the shot. Do not redesign, genericize, or drift toward a different face -- match this reference's facial structure, skin tone, and regional appearance precisely.${multiImageNote}`
      });
      parts.push(...ref.images.map((img) => ({ inlineData: img })));
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        // aspectRatio confirmed 2026-09-06 (Dan): 16:9 landscape, matching
        // the final video (GeminiVideoProvider.generateFinal below already
        // requests 16:9 from Veo). Before this, no aspect ratio was
        // requested at all -- Nano Banana was picking its own default,
        // which was landing mostly portrait, a real mismatch with the
        // landscape video these keyframes feed into. Confirmed the
        // imageConfig.aspectRatio field is real and respected by testing
        // directly against the live API, the same empirical approach used
        // to confirm Nano Banana's own model names.
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } }
      })
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini image generateContent failed (${model}) for shot ${request.shotId}: ${res.status} ${res.statusText} -- ${body}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> } }>;
      promptFeedback?: { blockReason?: string };
    };
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked shot ${request.shotId}'s prompt: ${data.promptFeedback.blockReason}`);
    }
    const imagePart = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData) {
      throw new Error(`Gemini returned no image data for shot ${request.shotId}: ${JSON.stringify(data).slice(0, 500)}`);
    }

    const dataDir = getDataDir();
    const relPath = join("generated", "keyframes", `${request.shotId}.png`);
    mkdirSync(join(dataDir, "assets", "generated", "keyframes"), { recursive: true });
    writeFileSync(join(dataDir, "assets", relPath), Buffer.from(imagePart.inlineData.data, "base64"));

    return {
      status: "accepted",
      media: { path: relPath },
      cost: { usd: costUsd },
      provenance: { provider: "gemini", model, prompt: request.prompt }
    };
  }
}

// The Interactions API (POST /<version>/interactions), confirmed live and
// real 2026-09-09 -- a genuinely different REST shape from the
// `models/<id>:generateContent` calls every other method in this file
// uses (input is an array of typed content blocks wrapped in one
// `{type: "user_input", content: [...]}` step, not `contents`/`parts`).
// See this file's header comment for the three real findings from
// confirming this against the live API.
//
// Two versions used deliberately, not one: `v1` is the stable/GA
// endpoint, confirmed to serve gemini-3.1-flash-image and
// gemini-3-pro-image (editRegion below); gemini-omni-1.1-flash is NOT in
// v1's own model catalog on this project's API key as of 2026-09-09 (only
// 21 models total, none "omni") even though Dan found documentation
// describing it as stable/GA -- that's either a staged rollout that
// hasn't reached this key/project yet, or forward-looking docs, but
// either way the live API is the authority here, not the doc. Omni only
// exists under `v1beta` right now (confirmed via v1beta's own model
// list), so generateDraft/generateGuided below call that version instead.
// If Omni later appears in `v1`'s model list, switch
// INTERACTIONS_VIDEO_VERSION below to "v1" -- the request shape itself
// doesn't need to change, v1beta accepts the same wrapped shape v1 requires.
const INTERACTIONS_VIDEO_VERSION = "v1beta";
const INTERACTIONS_IMAGE_EDIT_VERSION = "v1";

const OMNI_MODEL = "gemini-omni-1.1-flash";

// Rough estimate, NOT reconciled against a real invoice -- same honesty
// caveat as every other cost constant in this file. Omni's 360p draft
// tier is meant to be far cheaper than a full Veo render; this is a
// placeholder until real billing data is available.
const OMNI_DRAFT_COST_USD = 0.10;

type InteractionContentBlock =
  | { type: "image"; data: string; mime_type: string }
  | { type: "video"; uri: string }
  | { type: "text"; text: string };

interface InteractionStep {
  type: string;
  content?: Array<{ type: string; mime_type?: string; data?: string; uri?: string }>;
}

interface InteractionResponse {
  id?: string;
  status?: string;
  steps?: InteractionStep[];
  error?: { message?: string };
}

async function callInteractions(
  apiKey: string,
  version: string,
  model: string,
  content: InteractionContentBlock[],
  responseFormat: Record<string, unknown>
): Promise<InteractionResponse> {
  const url = `https://generativelanguage.googleapis.com/${version}/interactions?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{ type: "user_input", content }],
      response_format: responseFormat
    })
  });
  const data = (await res.json()) as InteractionResponse;
  if (!res.ok || data.error) {
    throw new Error(
      `Gemini Interactions API (${version}, ${model}) failed: ${res.status} ${res.statusText} -- ${JSON.stringify(data.error ?? data).slice(0, 500)}`
    );
  }
  return data;
}

/** Finds the model's actual output content of the given type -- errors
 *  loudly rather than returning undefined, since a wrong/ignored
 *  response_format (confirmed to happen silently on this API -- see this
 *  file's header) should fail the call, not produce a confusing downstream
 *  "no media" error far from the real cause. */
function extractOutputContent(
  data: InteractionResponse,
  type: "video" | "image",
  context: string
): { mime_type?: string; data: string } {
  const outputStep = data.steps?.find((s) => s.type === "model_output");
  const content = outputStep?.content?.find((c) => c.type === type);
  if (!content?.data) {
    const actualTypes = outputStep?.content?.map((c) => c.type).join(", ") ?? "none";
    throw new Error(
      `${context}: expected "${type}" output but got [${actualTypes}] -- Interactions API response: ${JSON.stringify(data).slice(0, 500)}`
    );
  }
  return { mime_type: content.mime_type, data: content.data };
}

export class GeminiImageEditor implements ImageEditor {
  /**
   * Targeted region edit -- confirmed real 2026-09-09 against
   * gemini-3.1-flash-image via the Interactions API (v1), NOT Omni 1.1:
   * asking Omni for image output silently returns video instead (see this
   * file's header). Uses the Pro model rather than the cheaper Nano
   * Banana tier -- an edit is almost always touching either an approved
   * canon character asset or an otherwise-accepted shot (PRODUCT_VISION.md),
   * both precision-sensitive enough to justify the higher-quality model
   * for a single small correction rather than risk a second retry.
   *
   * Empirically confirmed constraints (both produced real 400 errors when
   * violated): the output `mime_type` must be "image/jpeg" (png is
   * rejected), and `delivery` must be omitted entirely -- setting it to
   * "inline" (the value video output requires) errors with "Image
   * delivery mode is not supported".
   */
  async editRegion(asset: AssetRef, instruction: string): Promise<GenerationResult> {
    const apiKey = requireApiKey();
    const dataDir = getDataDir();
    const absPath = join(dataDir, "assets", asset.path);
    if (!existsSync(absPath)) {
      throw new Error(`editRegion: asset not found at ${absPath}.`);
    }
    const sourceExt = extname(absPath).slice(1).toLowerCase();
    const sourceMimeType = sourceExt === "jpg" ? "image/jpeg" : `image/${sourceExt || "png"}`;
    const sourceB64 = readFileSync(absPath).toString("base64");

    const data = await callInteractions(
      apiKey,
      INTERACTIONS_IMAGE_EDIT_VERSION,
      NANO_BANANA_PRO_MODEL,
      [
        { type: "image", data: sourceB64, mime_type: sourceMimeType },
        {
          type: "text",
          text:
            `Make ONLY this specific, targeted edit to the attached image -- leave every other detail (face, pose, ` +
            `composition, lighting, background, everything not explicitly mentioned) exactly as it already is: ${instruction}`
        }
      ],
      { type: "image", mime_type: "image/jpeg" }
    );
    const output = extractOutputContent(data, "image", `editRegion for ${asset.path}`);

    const relPath = join("generated", "edits", `${basename(absPath, extname(absPath))}-${randomUUID().slice(0, 8)}.jpg`);
    mkdirSync(join(dataDir, "assets", "generated", "edits"), { recursive: true });
    writeFileSync(join(dataDir, "assets", relPath), Buffer.from(output.data, "base64"));

    return {
      status: "accepted",
      media: { path: relPath },
      cost: { usd: NANO_BANANA_PRO_COST_USD },
      provenance: { provider: "gemini", model: NANO_BANANA_PRO_MODEL, prompt: instruction }
    };
  }

  /**
   * Like editRegion, but for the one case editRegion structurally can't
   * do: swapping WHO a person in an existing image is, not just touching
   * up a detail. editRegion takes a single source image and a text
   * instruction only -- there's nowhere to attach a real reference photo,
   * so asking it to "make the man in blue look like Jesus" has nothing to
   * anchor Jesus's actual canon face to and would drift generic, the same
   * likeness-drift problem loadCharacterReferenceImages was built to fix
   * for GeminiImageProvider.generate() above. This attaches the source
   * image AND the named character's real approved reference image(s) in
   * one Interactions call, so the edit has an actual face to match against
   * instead of guessing from a text description alone.
   *
   * Built 2026-09-09 for a real case: Scene 1's pilot-sourced roof-
   * lowering shot showed a generic stand-in actor as Jesus; Dan wanted
   * that figure re-cast as HeartWord's own canonical Jesus while every
   * other pixel (the four friends, the crowd, the rope rig, the overhead
   * camera angle) stayed exactly as filmed.
   */
  async recastCharacter(asset: AssetRef, character: CharacterRef, instruction: string): Promise<GenerationResult> {
    const apiKey = requireApiKey();
    const dataDir = getDataDir();
    const absPath = join(dataDir, "assets", asset.path);
    if (!existsSync(absPath)) {
      throw new Error(`recastCharacter: asset not found at ${absPath}.`);
    }
    const sourceExt = extname(absPath).slice(1).toLowerCase();
    const sourceMimeType = sourceExt === "jpg" ? "image/jpeg" : `image/${sourceExt || "png"}`;
    const sourceB64 = readFileSync(absPath).toString("base64");

    const [referenceImages] = loadCharacterReferenceImages([character]);
    if (!referenceImages || referenceImages.images.length === 0) {
      throw new Error(`recastCharacter: no reference images found for character version ${character.characterVersionId}.`);
    }

    const content: InteractionContentBlock[] = [
      { type: "image", data: sourceB64, mime_type: sourceMimeType },
      {
        type: "text",
        text:
          `Reference image(s) for ${referenceImages.characterName} -- this is the EXACT face, build, and likeness to use. ` +
          `Do not redesign, genericize, or drift toward a different face -- match this reference's facial structure, skin ` +
          `tone, and regional appearance precisely.`
      },
      ...referenceImages.images.map((img) => ({ type: "image" as const, data: img.data, mime_type: img.mimeType })),
      {
        type: "text",
        text:
          `In the attached scene image, replace ONLY the specific person described below with ${referenceImages.characterName} ` +
          `(using the exact reference likeness above) -- keep his approximate pose, position, and framing in the scene, but ` +
          `render his actual face/build/identity, and his established canon wardrobe if visible. Leave every other person, ` +
          `the rope rig, the crowd, the roof opening, the camera angle, the lighting, and every other detail in the image ` +
          `exactly as it already is: ${instruction}`
      }
    ];

    const data = await callInteractions(apiKey, INTERACTIONS_IMAGE_EDIT_VERSION, NANO_BANANA_PRO_MODEL, content, {
      type: "image",
      mime_type: "image/jpeg"
    });
    const output = extractOutputContent(data, "image", `recastCharacter for ${asset.path}`);

    const relPath = join("generated", "edits", `${basename(absPath, extname(absPath))}-recast-${randomUUID().slice(0, 8)}.jpg`);
    mkdirSync(join(dataDir, "assets", "generated", "edits"), { recursive: true });
    writeFileSync(join(dataDir, "assets", relPath), Buffer.from(output.data, "base64"));

    return {
      status: "accepted",
      media: { path: relPath },
      cost: { usd: NANO_BANANA_PRO_COST_USD },
      provenance: { provider: "gemini", model: NANO_BANANA_PRO_MODEL, prompt: instruction }
    };
  }
}

// Confirmed against the live Gemini API model list 2026-09-06:
// "models/veo-3.1-lite-generate-preview", displayName "Veo 3.1 lite" --
// matches PRODUCT_VISION.md's provider decision exactly (not the plain
// "veo-3.1-generate-preview" or "-fast-" variants also listed).
const VEO_MODEL = "veo-3.1-lite-generate-preview";

// Per-second rate for VEO_MODEL above, which is Veo 3.1 *Lite*. Dan gave
// the tier pricing directly (2026-09-20): Lite $0.05/sec, Fast $0.10/sec,
// Standard $0.20/sec. This previously read $0.20 -- the Standard rate --
// derived from an assumed "$1.60 for an always-8-second clip", so every
// recorded video cost was 4x the model actually being called. Note that
// generation_attempts.cost_usd is computed FROM this constant (see
// generateFinal below), so those rows are this estimate's own arithmetic,
// not independent evidence of what Google charged; they inherit any error
// here. Still not reconciled against a real invoice.
//
// There is deliberately no tier selection for video: every shot renders
// through Lite. Escalating a complex or emotional shot to Fast/Standard
// would need a tier parameter on VideoProvider.generateFinal and a
// per-tier rate here, the way GeminiImageProvider already switches
// between Nano Banana and Nano Banana Pro.
const VEO_COST_USD_PER_SECOND = 0.05;

interface VeoOperationResponse {
  name?: string;
  done?: boolean;
  error?: { message?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: { bytesBase64Encoded?: string; uri?: string } }>;
    };
  };
}

export interface VeoFrameGenerationRequest {
  prompt: string;
  startFramePath: string;
  /** Veo 3.1's optional closing-frame interpolation constraint. */
  endFramePath?: string;
  resolution: "720p" | "1080p";
  durationSeconds: 4 | 8;
  context: string;
}

export function buildVeoFrameRequestBody(
  prompt: string,
  startImageBase64: string,
  endImageBase64: string | undefined,
  resolution: "720p" | "1080p",
  durationSeconds: 4 | 8
) {
  return {
    instances: [
      {
        prompt,
        image: { bytesBase64Encoded: startImageBase64, mimeType: "image/png" },
        ...(endImageBase64 ? { lastFrame: { bytesBase64Encoded: endImageBase64, mimeType: "image/png" } } : {})
      }
    ],
    // Veo 3.1 Lite does not accept generateAudio:false. Callers that need
    // silence must remove the generated track after download.
    parameters: { aspectRatio: "16:9", durationSeconds, resolution }
  };
}

/**
 * Runs one Veo 3.1 image-to-video operation from local frame files. This is a
 * narrow adapter primitive for the private control-room presentation script,
 * so it can send the documented `lastFrame` request shape without database or
 * production-pipeline access.
 */
export async function generateVeoFromFrames(request: VeoFrameGenerationRequest): Promise<Buffer> {
  const apiKey = requireApiKey();
  if (!existsSync(request.startFramePath)) {
    throw new Error(`Veo start frame for ${request.context} is missing: ${request.startFramePath}`);
  }
  if (request.endFramePath && !existsSync(request.endFramePath)) {
    throw new Error(`Veo end frame for ${request.context} is missing: ${request.endFramePath}`);
  }
  const startImageBase64 = readFileSync(request.startFramePath).toString("base64");
  const endImageBase64 = request.endFramePath ? readFileSync(request.endFramePath).toString("base64") : undefined;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${VEO_MODEL}:predictLongRunning?key=${apiKey}`;
  const submitRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      buildVeoFrameRequestBody(
        request.prompt,
        startImageBase64,
        endImageBase64,
        request.resolution,
        request.durationSeconds
      )
    )
  });
  if (!submitRes.ok) {
    const body = await submitRes.text().catch(() => "");
    throw new Error(`Veo predictLongRunning failed for ${request.context}: ${submitRes.status} ${submitRes.statusText} -- ${body}`);
  }
  const submitData = (await submitRes.json()) as VeoOperationResponse;
  const operationName = submitData.name;
  if (!operationName) {
    throw new Error(`Veo returned no operation name for ${request.context}: ${JSON.stringify(submitData).slice(0, 500)}`);
  }
  const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;
  const deadline = Date.now() + 15 * 60 * 1000;
  let finalStatus: VeoOperationResponse | undefined;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 15000));
    const pollRes = await fetch(pollUrl);
    if (!pollRes.ok) {
      const body = await pollRes.text().catch(() => "");
      throw new Error(`Veo operation poll failed for ${request.context}: ${pollRes.status} -- ${body}`);
    }
    const pollData = (await pollRes.json()) as VeoOperationResponse;
    if (pollData.done) {
      finalStatus = pollData;
      break;
    }
  }
  if (!finalStatus) throw new Error(`Veo operation for ${request.context} did not finish within 15 minutes.`);
  if (finalStatus.error) throw new Error(`Veo operation failed for ${request.context}: ${finalStatus.error.message ?? "unknown error"}`);
  const sample = finalStatus.response?.generateVideoResponse?.generatedSamples?.[0];
  if (!sample?.video) {
    throw new Error(`Veo operation for ${request.context} finished with no video sample: ${JSON.stringify(finalStatus).slice(0, 500)}`);
  }
  if (sample.video.bytesBase64Encoded) return Buffer.from(sample.video.bytesBase64Encoded, "base64");
  if (!sample.video.uri) throw new Error(`Veo video sample for ${request.context} has neither bytesBase64Encoded nor uri.`);
  const fileRes = await fetch(sample.video.uri, { headers: { "x-goog-api-key": apiKey } });
  if (!fileRes.ok) throw new Error(`Failed downloading Veo output for ${request.context}: ${fileRes.status} ${fileRes.statusText}`);
  return Buffer.from(await fileRes.arrayBuffer());
}

export class GeminiVideoProvider implements VideoProvider {
  async generateFinal(
    request: ShotRequest,
    opts?: { resolution?: "720p" | "1080p"; startFrame?: AssetRef; durationSeconds?: number }
  ): Promise<GenerationResult> {
    const apiKey = requireApiKey();
    const resolution = opts?.resolution ?? "720p";
    // Veo's stated bound is "between 4 and 8, inclusive" (2026-09-09, a
    // live 400 response), but the REAL constraint is a discrete set
    // within that range, not every value in it -- confirmed twice more
    // (2026-09-09's original 5, and 2026-09-10's 7) both getting the
    // IDENTICAL "out of bound" error text despite being inside [4,8].
    // Only 4 and 8 have ever actually succeeded across this whole
    // project's real calls, so every request snaps to whichever of
    // those two is closer rather than trusting an arbitrary intermediate
    // value -- clip-assembly already trims/extends to a shot's own real
    // target duration regardless of which of these two Veo actually
    // rendered, so this doesn't lose precision that mattered anyway.
    const requested = opts?.durationSeconds ?? 8;
    const durationSeconds = requested <= 6 ? 4 : 8;
    const dataDir = getDataDir();

    // Veo does image-to-video from a single start frame. Default: reuse
    // whatever stage 4's ImageProvider already generated for this shot
    // (the same DB-lookup-by-shotId pattern loadCharacterReferenceImages
    // above uses for character likeness). opts.startFrame overrides this
    // -- required for a covered_sequence beat, whose own keyframe lives in
    // coverage_beats, not this shot-level lookup (see VideoProvider's
    // interface comment).
    let keyframeRelPath: string;
    if (opts?.startFrame) {
      keyframeRelPath = opts.startFrame.path;
    } else {
      const db = getDb();
      const keyframeRow = db
        .prepare(
          `SELECT result_asset_path FROM generation_attempts
           WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted'
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(request.shotId) as { result_asset_path: string | null } | undefined;
      if (!keyframeRow?.result_asset_path) {
        throw new Error(
          `No accepted keyframe found for shot ${request.shotId} -- run stage 4's ImageProvider.generate() first, Veo needs a start frame.`
        );
      }
      keyframeRelPath = keyframeRow.result_asset_path;
    }
    const keyframePath = join(dataDir, "assets", keyframeRelPath);
    if (!existsSync(keyframePath)) {
      throw new Error(`Keyframe file for shot ${request.shotId} is missing on disk: ${keyframePath}`);
    }
    const startImageBase64 = readFileSync(keyframePath).toString("base64");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${VEO_MODEL}:predictLongRunning?key=${apiKey}`;
    const submitRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [
          {
            prompt: request.prompt,
            image: { bytesBase64Encoded: startImageBase64, mimeType: "image/png" }
          }
        ],
        // NOTE: generateAudio:false was tried here 2026-09-09 to suppress
        // Veo's own (always-muted-in-the-edit-anyway) audio track after a
        // real RAI-filter failure on a silent master shot's synthesized
        // audio -- but veo-3.1-lite-generate-preview rejects that param
        // outright ("generateAudio isn't supported by this model"),
        // confirmed empirically. Left unset; see VEO_MODEL if this
        // resurfaces and a variant that supports it becomes worth using.
        parameters: { aspectRatio: "16:9", durationSeconds, resolution }
      })
    });

    if (!submitRes.ok) {
      const body = await submitRes.text().catch(() => "");
      throw new Error(`Veo predictLongRunning failed for shot ${request.shotId}: ${submitRes.status} ${submitRes.statusText} -- ${body}`);
    }
    const submitData = (await submitRes.json()) as VeoOperationResponse;
    const operationName = submitData.name;
    if (!operationName) {
      throw new Error(`Veo returned no operation name for shot ${request.shotId}: ${JSON.stringify(submitData).slice(0, 500)}`);
    }

    // Long-running operation -- poll until done. Veo 3.1 Lite typically
    // takes a few minutes; 15 minutes is a generous ceiling before giving
    // up, matching the prior claude-pilot Veo benchmark's own timeout.
    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;
    const deadline = Date.now() + 15 * 60 * 1000;
    let finalStatus: VeoOperationResponse | undefined;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 15000));
      const pollRes = await fetch(pollUrl);
      if (!pollRes.ok) {
        const body = await pollRes.text().catch(() => "");
        throw new Error(`Veo operation poll failed for shot ${request.shotId}: ${pollRes.status} -- ${body}`);
      }
      const pollData = (await pollRes.json()) as VeoOperationResponse;
      if (pollData.done) {
        finalStatus = pollData;
        break;
      }
    }
    if (!finalStatus) {
      throw new Error(`Veo operation for shot ${request.shotId} did not finish within 15 minutes.`);
    }
    if (finalStatus.error) {
      throw new Error(`Veo operation failed for shot ${request.shotId}: ${finalStatus.error.message ?? "unknown error"}`);
    }

    const sample = finalStatus.response?.generateVideoResponse?.generatedSamples?.[0];
    if (!sample?.video) {
      throw new Error(`Veo operation for shot ${request.shotId} finished with no video sample: ${JSON.stringify(finalStatus).slice(0, 500)}`);
    }

    let videoBuffer: Buffer;
    if (sample.video.bytesBase64Encoded) {
      videoBuffer = Buffer.from(sample.video.bytesBase64Encoded, "base64");
    } else if (sample.video.uri) {
      // Matches claude-pilot/gen_veo.py's proven download pattern -- the
      // generated-file URI needs the header form of the API key, not the
      // ?key= query param used for the other calls above.
      const fileRes = await fetch(sample.video.uri, { headers: { "x-goog-api-key": apiKey } });
      if (!fileRes.ok) {
        throw new Error(`Failed downloading Veo output for shot ${request.shotId}: ${fileRes.status} ${fileRes.statusText}`);
      }
      videoBuffer = Buffer.from(await fileRes.arrayBuffer());
    } else {
      throw new Error(`Veo video sample for shot ${request.shotId} has neither bytesBase64Encoded nor uri.`);
    }

    const relPath = join("generated", "video", `${request.shotId}.mp4`);
    mkdirSync(join(dataDir, "assets", "generated", "video"), { recursive: true });
    writeFileSync(join(dataDir, "assets", relPath), videoBuffer);

    return {
      status: "accepted",
      media: { path: relPath },
      cost: { usd: Math.round(durationSeconds * VEO_COST_USD_PER_SECOND * 100) / 100 },
      provenance: { provider: "gemini", model: VEO_MODEL, prompt: request.prompt }
    };
  }
}

function loadImageAsContentBlock(dataDir: string, assetPath: string, label: string): InteractionContentBlock {
  const absPath = join(dataDir, "assets", assetPath);
  if (!existsSync(absPath)) {
    throw new Error(`${label}: asset not found at ${absPath}.`);
  }
  const ext = extname(absPath).slice(1).toLowerCase();
  const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext || "png"}`;
  return { type: "image", data: readFileSync(absPath).toString("base64"), mime_type: mimeType };
}

export class GeminiDraftVideoProvider implements DraftVideoProvider {
  /**
   * Omni 1.1's cheap 360p draft tier -- confirmed real 2026-09-09: a
   * synchronous call (no long-running-operation polling like Veo needs)
   * that returns inline base64 mp4 directly in the response. Reuses the
   * same character-reference-image + identity-lock prompt pattern
   * GeminiImageProvider.generate() already uses, since Omni is just as
   * prone to drifting a named character's face without it.
   */
  async generateDraft(request: ShotRequest, opts?: { startFrame?: AssetRef }): Promise<GenerationResult> {
    const apiKey = requireApiKey();
    const dataDir = getDataDir();

    const content: InteractionContentBlock[] = [];
    if (opts?.startFrame) {
      // A specific composed shot/beat keyframe to animate from -- takes
      // priority over generic character references, same as
      // VideoProvider.generateFinal's startFrame override.
      content.push(loadImageAsContentBlock(dataDir, opts.startFrame.path, "generateDraft startFrame"));
    } else {
      const referenceImages = loadCharacterReferenceImages(request.characters);
      for (const ref of referenceImages) {
        content.push({
          text: `Reference image(s) for ${ref.characterName} -- this is the EXACT face, build, and likeness to use for ${ref.characterName} in the video. Do not redesign or genericize.`,
          type: "text"
        });
        content.push(...ref.images.map((img) => ({ type: "image" as const, data: img.data, mime_type: img.mimeType })));
      }
    }
    content.push({ type: "text", text: request.prompt });

    const data = await callInteractions(apiKey, INTERACTIONS_VIDEO_VERSION, OMNI_MODEL, content, {
      type: "video",
      resolution: "360p",
      aspect_ratio: "16:9",
      delivery: "inline"
    });
    const output = extractOutputContent(data, "video", `generateDraft for shot ${request.shotId}`);

    const relPath = join("generated", "drafts", `${request.shotId}.mp4`);
    mkdirSync(join(dataDir, "assets", "generated", "drafts"), { recursive: true });
    writeFileSync(join(dataDir, "assets", relPath), Buffer.from(output.data, "base64"));

    return {
      status: "accepted",
      media: { path: relPath },
      cost: { usd: OMNI_DRAFT_COST_USD },
      provenance: { provider: "gemini", model: OMNI_MODEL, prompt: request.prompt }
    };
  }

  /**
   * Omni 1.1's start/end-keyframe-guided generation -- same endpoint and
   * response shape as generateDraft, confirmed real 2026-09-09 with two
   * different characters' headshots as start/end frames and a transition
   * instruction (produced a real, coherent transition, not an error or a
   * static/frozen clip).
   */
  async generateGuided(startFrame: AssetRef, endFrame: AssetRef, request: ShotRequest): Promise<GenerationResult> {
    const apiKey = requireApiKey();
    const dataDir = getDataDir();

    const content: InteractionContentBlock[] = [
      loadImageAsContentBlock(dataDir, startFrame.path, "generateGuided startFrame"),
      loadImageAsContentBlock(dataDir, endFrame.path, "generateGuided endFrame"),
      { type: "text", text: request.prompt }
    ];

    const data = await callInteractions(apiKey, INTERACTIONS_VIDEO_VERSION, OMNI_MODEL, content, {
      type: "video",
      resolution: "360p",
      aspect_ratio: "16:9",
      delivery: "inline"
    });
    const output = extractOutputContent(data, "video", `generateGuided for shot ${request.shotId}`);

    const relPath = join("generated", "drafts", `${request.shotId}-guided.mp4`);
    mkdirSync(join(dataDir, "assets", "generated", "drafts"), { recursive: true });
    writeFileSync(join(dataDir, "assets", relPath), Buffer.from(output.data, "base64"));

    return {
      status: "accepted",
      media: { path: relPath },
      cost: { usd: OMNI_DRAFT_COST_USD },
      provenance: { provider: "gemini", model: OMNI_MODEL, prompt: request.prompt }
    };
  }
}
