import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
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
  /** Local review-only encoding proof. The delivered/provider original and
   * its independent audio candidate are retained unchanged. */
  reviewInput?: { originalPath: string; originalSha256: string; path: string; sha256: string; provenancePath: string };
  /** The actual supplied endpoint, independent of the starting identity anchor. */
  endFrameReference?: { path: string; sha256: string };
}

/** Below this the clip is not treated as having passed. Matches the
 *  threshold the soundtrack review already uses for generated media. */
export const VIDEO_REVIEW_MIN_CONFIDENCE = 80;

/** Gemini rejects oversized inline media; a clip this large needs a
 *  smaller proxy rather than a failed call halfway through a render. */
export const MAX_REVIEW_PROXY_BYTES = 18 * 1024 * 1024;

function verifiedReviewProxy(originalPath: string, streamCopy = false): NonNullable<VideoReviewResult["reviewInput"]> {
  const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const path = `${originalPath}.picture-review-proxy.mp4`, provenancePath = `${path}.json`, originalSha256 = hash(originalPath);
  const probe = (file: string) => JSON.parse(execFileSync("ffprobe", ["-v","error","-count_frames","-show_streams","-of","json",file], { encoding: "utf8", windowsHide: true })) as
    { streams: Array<{ codec_type: string; width: number; height: number; avg_frame_rate: string; nb_read_frames: string; duration: string }> };
  if (existsSync(path) || existsSync(provenancePath)) {
    if (!existsSync(path) || !existsSync(provenancePath)) throw new Error("Retained review proxy is incomplete; reconcile it before another encoding or review.");
    const saved = JSON.parse(readFileSync(provenancePath,"utf8")) as NonNullable<VideoReviewResult["reviewInput"]>;
    if (basename(saved.originalPath) !== basename(originalPath) || saved.originalSha256 !== originalSha256 || basename(saved.path) !== basename(path) || basename(saved.provenancePath) !== basename(provenancePath) || hash(path) !== saved.sha256) throw new Error("Retained review proxy or original changed; no review submitted.");
    return { ...saved, originalPath, path, provenancePath };
  }
  try {
    const source = probe(originalPath).streams.find(s => s.codec_type === "video");
    if (!source || !Number.isFinite(Number(source.nb_read_frames)) || Number(source.nb_read_frames) < 1 || !Number.isFinite(Number(source.duration))) throw new Error("Decoded original timing is unavailable.");
    execFileSync("ffmpeg", ["-v","error","-n","-i",originalPath,"-map","0:v:0","-an",
      ...(streamCopy ? ["-c:v","copy"] : ["-c:v","libx264","-crf","24","-fps_mode","passthrough"]),"-movflags","+faststart",path], { windowsHide: true, stdio: ["ignore","ignore","pipe"] });
    const result = probe(path), video = result.streams[0];
    if (result.streams.length !== 1 || video?.codec_type !== "video" || video.width !== source.width || video.height !== source.height || video.avg_frame_rate !== source.avg_frame_rate || video.nb_read_frames !== source.nb_read_frames || Math.abs(Number(video.duration)-Number(source.duration)) > .001 || readFileSync(path).length > MAX_REVIEW_PROXY_BYTES) throw new Error("Proxy does not preserve every frame, geometry, rate and duration within the review size limit.");
    const proof = { originalPath, originalSha256, path, sha256: hash(path), provenancePath };
    if (hash(originalPath) !== originalSha256) throw new Error("Original changed during proxy encoding.");
    writeFileSync(provenancePath,JSON.stringify({ ...proof,sourceVideo:source,reviewVideo:video,transformation:streamCopy
      ? "Same video packets/decoded frames and native geometry/rate/duration; stream-copy with audio removed. Review-only, original video and independent audio unchanged."
      : "Same decoded frames, native geometry/rate/duration, H264 CRF24, no audio; review-only copy, no generation or speech edits." },null,2)+"\n",{flag:"wx"});
    return proof;
  } catch (error) {
    throw new Error(`Video needs a smaller review proxy before acceptance; a verified local copy could not be prepared: ${(error as Error).message}`);
  }
}

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    pass: { type: "boolean" },
    confidence: { type: "integer", description: "Confidence on the required 0–100 scale, for example 95. Fractions such as 0.95 are invalid." },
    reason: { type: "string" }
  },
  required: ["pass", "confidence", "reason"]
};

export async function reviewGeneratedVideo(input: {
  /** Absolute path to the generated clip. */
  videoPath: string;
  /** Absolute path to the keyframe it was asked to animate. */
  keyframePath: string;
  /** Optional provider-pinned endpoint; changed bytes hold before a model call. */
  endFrameReference?: { path: string; sha256: string };
  /** What this shot was directed to show. */
  instruction: string;
}): Promise<VideoReviewResult> {
  const endingBytes = input.endFrameReference ? readFileSync(input.endFrameReference.path) : undefined;
  if (endingBytes && createHash("sha256").update(endingBytes).digest("hex") !== input.endFrameReference!.sha256) throw new Error("Provider-pinned ending reference changed; no motion review submitted.");
  let bytes = readFileSync(input.videoPath);
  let reviewInput = bytes.length > MAX_REVIEW_PROXY_BYTES ? verifiedReviewProxy(input.videoPath) : undefined;
  if (!reviewInput) {
    // A prompt saying "picture only" cannot prevent a multimodal reviewer
    // from hearing native narration. Keep that independently reviewed track
    // out of the picture input even when the original fits inline.
    const audio = execFileSync("ffprobe",["-v","error","-select_streams","a","-show_entries","stream=index","-of","csv=p=0",input.videoPath],
      {encoding:"utf8",windowsHide:true,stdio:["ignore","pipe","pipe"]}).trim();
    if (audio) reviewInput = verifiedReviewProxy(input.videoPath,true);
  }
  if (reviewInput) bytes = readFileSync(reviewInput.path);
  const { result, costUsd } = await generateJsonWithImagesMetered<VideoReviewVerdict>(
    `Independently watch this non-speaking supplementary shot against its approved keyframe direction: ${input.instruction}. ` +
      "Judge the picture and visible performance, including unwanted visible talking. Native audio is a separate candidate with its own listening review before mixing; this verdict does not approve that soundtrack. " +
      "Identity is a hard gate: every visible person must retain the same approved Papuan/Hatam facial appearance, skin tone, hair, build, and canonical wardrobe as the supplied keyframe throughout the clip. Any Caucasian, European, Levantine, generic substitute identity, or material identity drift is a failure. " +
      "Check motion, continuity, physical action, source fidelity, unwanted text, crowd choreography, and whether a requested nonverbal emotion is visible without adding speech or a new event. A synchronized wave of arms, repeated group gesture, mirrored movement, or mass simultaneous reach-and-retract is a failure unless the approved direction explicitly requires it. Do not approve uncertain evidence." +
      (endingBytes ? " Two separately labelled references follow: START is the identity/setting anchor; END is the actual provider-pinned endpoint. Judge the end against END, never against START. Report any concrete endpoint discrepancy with its time and visible evidence. Distinguish a required source/identity/physical endpoint state from minor framing or running-stride variation; do not require a moving subject to freeze in a pose unless the direction actually requires a hold." : ""),
    [
      { mimeType: "video/mp4", data: bytes.toString("base64") },
      { mimeType: "image/png", caption: "START: actual accepted starting picture and identity/setting anchor", data: readFileSync(input.keyframePath).toString("base64") },
      ...(endingBytes ? [{ mimeType: "image/png", caption: "END: actual provider-pinned ending picture, not another start or an actual video frame", data: endingBytes.toString("base64") }] : [])
    ],
    VERDICT_SCHEMA
  );
  return { verdict: result, costUsd, ...(reviewInput ? { reviewInput } : {}), ...(input.endFrameReference ? { endFrameReference: input.endFrameReference } : {}) };
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
