/**
 * Google Gemini adapter: Nano Banana / Nano Banana Pro (ImageProvider),
 * Veo 3.1 Lite (VideoProvider), and Gemini Omni 1.1 (DraftVideoProvider +
 * ImageEditor) — one vendor family, one adapter module, per "Confirmed v1
 * providers" in docs/ARCHITECTURE.md. Authenticated with GEMINI_API_KEY
 * (see .env.example).
 *
 * ImageProvider.generate() and VideoProvider.generateFinal() are
 * implemented for real (2026-09-06) -- ImageEditor and DraftVideoProvider
 * are still interface wiring only, each its own deliberately-scoped
 * follow-up. See docs/plans/CURRENT_GOAL.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import type {
  AssetRef,
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

function notImplemented(operation: string): never {
  throw new Error(`Gemini adapter: ${operation} is not implemented yet.`);
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
    `SELECT category, path FROM character_assets
     WHERE character_version_id = ?
     ORDER BY CASE category WHEN 'headshot' THEN 0 WHEN 'turnaround' THEN 1 WHEN 'body_pose' THEN 2 ELSE 3 END`
  );
  const findName = db.prepare(
    `SELECT c.name FROM characters c JOIN character_versions cv ON cv.character_id = c.id WHERE cv.id = ?`
  );

  const result: CharacterReferenceImages[] = [];
  for (const character of characters) {
    const rows = findAssets.all(character.characterVersionId) as ReferenceAssetRow[];
    const nameRow = findName.get(character.characterVersionId) as { name: string } | undefined;
    const characterName = nameRow?.name ?? "this character";

    // First asset (headshot/turnaround), plus one more from a DIFFERENT
    // category if available (typically a body_pose) -- two distinct views
    // anchor a face far better than one, without attaching every pose on
    // file.
    const chosen: ReferenceAssetRow[] = [];
    for (const row of rows) {
      if (chosen.length === 0 || row.category !== chosen[0].category) {
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

export class GeminiImageEditor implements ImageEditor {
  async editRegion(_asset: AssetRef, _instruction: string): Promise<GenerationResult> {
    requireApiKey();
    notImplemented("editRegion (Omni 1.1 targeted image editing)");
  }
}

// Confirmed against the live Gemini API model list 2026-09-06:
// "models/veo-3.1-lite-generate-preview", displayName "Veo 3.1 lite" --
// matches PRODUCT_VISION.md's provider decision exactly (not the plain
// "veo-3.1-generate-preview" or "-fast-" variants also listed).
const VEO_MODEL = "veo-3.1-lite-generate-preview";

// Rough public-pricing-based estimate, NOT reconciled against a real
// invoice -- same honesty caveat as the Nano Banana cost constants above.
// Veo charges per second of output; this is a flat per-8-second-clip
// estimate at 720p.
const VEO_COST_USD_PER_CLIP = 1.60;

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

export class GeminiVideoProvider implements VideoProvider {
  async generateFinal(request: ShotRequest, opts?: { resolution?: "720p" | "1080p" }): Promise<GenerationResult> {
    const apiKey = requireApiKey();
    const resolution = opts?.resolution ?? "720p";
    const dataDir = getDataDir();

    // Veo does image-to-video from a single start frame -- ShotRequest has
    // no image field of its own, so this reuses whatever stage 4's
    // ImageProvider already generated for this shot (the same DB-lookup-
    // by-shotId pattern loadCharacterReferenceImages above uses for
    // character likeness). A shot with no keyframe yet can't be animated.
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
    const keyframePath = join(dataDir, "assets", keyframeRow.result_asset_path);
    if (!existsSync(keyframePath)) {
      throw new Error(`Keyframe file recorded for shot ${request.shotId} is missing on disk: ${keyframePath}`);
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
        parameters: { aspectRatio: "16:9", durationSeconds: 8, resolution }
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
      cost: { usd: VEO_COST_USD_PER_CLIP },
      provenance: { provider: "gemini", model: VEO_MODEL, prompt: request.prompt }
    };
  }
}

export class GeminiDraftVideoProvider implements DraftVideoProvider {
  async generateDraft(_request: ShotRequest): Promise<GenerationResult> {
    requireApiKey();
    notImplemented("generateDraft (Omni 1.1, 360p)");
  }

  async generateGuided(_startFrame: AssetRef, _endFrame: AssetRef, _request: ShotRequest): Promise<GenerationResult> {
    requireApiKey();
    notImplemented("generateGuided (Omni 1.1, start/end-keyframe)");
  }
}
