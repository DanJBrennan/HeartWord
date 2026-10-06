import { readFileSync } from "node:fs";
import { generateJsonWithImagesMetered } from "../../providers/gemini-text.js";

/**
 * Watches a generated clip against the keyframe it was supposed to
 * animate, and says whether it actually shows that. The only automated
 * check in this project that looks at motion: every other QC pass
 * (qc/critic.ts, qc/canonical-likeness.ts, qc/scene-fidelity.ts) reads
 * still images, so nothing before this could tell whether a clip moved
 * the way its direction asked.
 *
 * Extracted from creative-direction/implement.ts, where it was inline and
 * reachable only by gap-filler videos, so the draft room can use the same
 * check -- see docs/design/media-generation.md, which expects a draft to
 * be evaluated "by the producer, by automated review, or both".
 *
 * The verdict is advisory evidence, not a decision. Callers differ on what
 * to do with a failure by design: a directed video that fails is held
 * (it would otherwise become deliverable footage), whereas a draft that
 * fails is simply recorded as such, since the producer is choosing
 * between drafts and an uncalibrated confidence score should not veto
 * that choice.
 */
export interface VideoReviewVerdict {
  pass: boolean;
  /** 0-100, the model's own uncalibrated certainty -- never a severity,
   *  an authority, or permission to skip a human gate. */
  confidence: number;
  reason: string;
}

export interface VideoReviewResult {
  verdict: VideoReviewVerdict;
  /** Recorded by the caller against the project, like any other spend. */
  costUsd: number;
}

/** Below this the clip is not treated as having passed. Matches the
 *  threshold the soundtrack review already uses for generated media. */
export const VIDEO_REVIEW_MIN_CONFIDENCE = 80;

/** Gemini rejects oversized inline media; a clip this large needs a
 *  smaller proxy rather than a failed call halfway through a render. */
export const MAX_REVIEW_PROXY_BYTES = 18 * 1024 * 1024;

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    pass: { type: "boolean" },
    confidence: { type: "number" },
    reason: { type: "string" }
  },
  required: ["pass", "confidence", "reason"]
};

export async function reviewGeneratedVideo(input: {
  /** Absolute path to the generated clip. */
  videoPath: string;
  /** Absolute path to the keyframe it was asked to animate. */
  keyframePath: string;
  /** What this shot was directed to show. */
  instruction: string;
}): Promise<VideoReviewResult> {
  const bytes = readFileSync(input.videoPath);
  if (bytes.length > MAX_REVIEW_PROXY_BYTES) throw new Error("Video needs a smaller review proxy before acceptance.");
  const { result, costUsd } = await generateJsonWithImagesMetered<VideoReviewVerdict>(
    `Independently watch this silent supplementary shot against its approved keyframe direction: ${input.instruction}. ` +
      "Identity is a hard gate: every visible person must retain the same approved Papuan/Hatam facial appearance, skin tone, hair, build, and canonical wardrobe as the supplied keyframe throughout the clip. Any Caucasian, European, Levantine, generic substitute identity, or material identity drift is a failure. " +
      "Check motion, continuity, physical action, source fidelity, unwanted text, crowd choreography, and whether a requested nonverbal emotion is visible without adding speech or a new event. A synchronized wave of arms, repeated group gesture, mirrored movement, or mass simultaneous reach-and-retract is a failure unless the approved direction explicitly requires it. Do not approve uncertain evidence.",
    [
      { mimeType: "video/mp4", data: bytes.toString("base64") },
      { mimeType: "image/png", data: readFileSync(input.keyframePath).toString("base64") }
    ],
    VERDICT_SCHEMA
  );
  return { verdict: result, costUsd };
}

/** Whether a verdict clears the bar: an explicit pass, a real reason, and
 *  a confidence actually inside 0-100 rather than a number the model
 *  invented to look certain. */
export function videoReviewPassed(verdict: VideoReviewVerdict): boolean {
  return verdict.pass === true
    && Number.isFinite(verdict.confidence)
    && verdict.confidence >= VIDEO_REVIEW_MIN_CONFIDENCE
    && verdict.confidence <= 100
    && Boolean(verdict.reason?.trim());
}
