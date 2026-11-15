import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Guard against residual micro-clips caused by inaccurate picture cuts. */
export const FLASH_MAX_FRAMES = 5;

export type TimedPicturePlacement = {
  shotId?: string;
  id?: string;
  startMs: number;
  endMs: number;
};

export type FlashFinding = {
  label: string;
  startFrame: number;
  endFrameExclusive: number;
  frameCount: number;
  startMs: number;
  endMs: number;
};

export type FlashContinuity = "continuous_with_preceding" | "continuous_with_following" | "discontinuous";
export type RenderedFlashFinding = FlashFinding & {
  precedingSimilarity: number;
  followingSimilarity: number;
  continuity: FlashContinuity;
};

function frameAt(ms: number, fps: number): number {
  return Math.round(ms * fps / 1000);
}

/** Detect planned picture placements of five encoded frames or fewer. */
export function detectTimelineFlashes(placements: TimedPicturePlacement[], fps = 24, maxFrames = FLASH_MAX_FRAMES): FlashFinding[] {
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isInteger(maxFrames) || maxFrames < 1) throw new Error("A positive frame rate and frame threshold are required.");
  return placements.flatMap((placement, index) => {
    if (!Number.isFinite(placement.startMs) || !Number.isFinite(placement.endMs) || placement.endMs <= placement.startMs) {
      throw new Error(`Picture placement ${placement.shotId ?? placement.id ?? index} has an invalid duration.`);
    }
    const startFrame = frameAt(placement.startMs, fps), endFrameExclusive = frameAt(placement.endMs, fps);
    const frameCount = endFrameExclusive - startFrame;
    if (frameCount < 1) throw new Error(`Picture placement ${placement.shotId ?? placement.id ?? index} is shorter than one encoded frame.`);
    return frameCount <= maxFrames ? [{
      label: placement.shotId ?? placement.id ?? `placement ${index + 1}`,
      startFrame, endFrameExclusive, frameCount, startMs: placement.startMs, endMs: placement.endMs
    }] : [];
  });
}

/** Turn post-render scene-cut times into candidate flash intervals for review. */
export function detectRapidVisualCutFlashes(cutTimesMs: number[], fps = 24, maxFrames = FLASH_MAX_FRAMES): FlashFinding[] {
  const ordered = [...cutTimesMs];
  if (ordered.some((time, index) => !Number.isFinite(time) || time < 0 || (index > 0 && time <= ordered[index - 1]!))) {
    throw new Error("Visual cut times must be finite, non-negative, and ordered.");
  }
  const placements = ordered.slice(1).map((endMs, index) => ({ id: `visual-cut ${index + 1}`, startMs: ordered[index]!, endMs }));
  return detectTimelineFlashes(placements, fps, maxFrames);
}

/** A short interval is safe when it visibly continues either adjacent shot. */
// Fast camera or subject motion can lower adjacent-frame SSIM substantially
// without introducing a new scene. This calibrated floor accepts those
// continuous moves while retaining the much lower scene-break scores seen in
// genuine micro-flashes.
export function classifyFlashContinuity(precedingSimilarity: number, followingSimilarity: number, threshold = 0.5): FlashContinuity {
  if (!Number.isFinite(precedingSimilarity) || !Number.isFinite(followingSimilarity) || !Number.isFinite(threshold)) throw new Error("Finite continuity scores are required.");
  if (precedingSimilarity >= threshold) return "continuous_with_preceding";
  if (followingSimilarity >= threshold) return "continuous_with_following";
  return "discontinuous";
}

function runFfmpeg(args: string[]): string {
  const result = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || "FFmpeg flash analysis failed.");
  return `${result.stdout}\n${result.stderr}`;
}

function allSimilarity(left: string, right: string): number {
  const output = runFfmpeg(["-hide_banner", "-i", left, "-i", right, "-lavfi", "ssim", "-f", "null", "-"]);
  const match = /All:([0-9.]+)/.exec(output);
  if (!match) throw new Error("FFmpeg did not return an SSIM score.");
  return Number(match[1]);
}

/**
 * Audits the final encoded picture. Scene cuts yield only candidates; each is
 * retained as a flash only when it differs from both immediate neighbours.
 */
export function auditRenderedFlashes(videoPath: string, fps = 24, sceneThreshold = 0.08): RenderedFlashFinding[] {
  if (!existsSync(videoPath)) throw new Error(`Missing rendered video: ${videoPath}`);
  const sceneLog = runFfmpeg(["-hide_banner", "-i", videoPath, "-an", "-vf", `select='gt(scene,${sceneThreshold})',showinfo`, "-f", "null", "-"]);
  const cutTimesMs = [...sceneLog.matchAll(/pts_time:([0-9.]+)/g)].map(match => Math.round(Number(match[1]) * 1000));
  const candidates = detectRapidVisualCutFlashes(cutTimesMs, fps);
  if (!candidates.length) return [];
  const frames = [...new Set(candidates.flatMap(candidate => [candidate.startFrame - 1, candidate.startFrame, candidate.endFrameExclusive - 1, candidate.endFrameExclusive]))]
    .filter(frame => frame >= 0).sort((a, b) => a - b);
  const directory = mkdtempSync(join(tmpdir(), "heartword-flash-"));
  try {
    const expression = frames.map(frame => `eq(n\\,${frame})`).join("+");
    runFfmpeg(["-v", "error", "-i", videoPath, "-vf", `select='${expression}'`, "-vsync", "0", "-start_number", "0", join(directory, "frame-%03d.png")]);
    const imageFor = new Map(frames.map((frame, index) => [frame, join(directory, `frame-${String(index).padStart(3, "0")}.png`)]));
    for (const image of imageFor.values()) if (!existsSync(image)) throw new Error("FFmpeg did not extract every flash-boundary frame.");
    return candidates.map(candidate => {
      const precedingSimilarity = allSimilarity(imageFor.get(candidate.startFrame - 1)!, imageFor.get(candidate.startFrame)!);
      const followingSimilarity = allSimilarity(imageFor.get(candidate.endFrameExclusive - 1)!, imageFor.get(candidate.endFrameExclusive)!);
      return { ...candidate, precedingSimilarity, followingSimilarity, continuity: classifyFlashContinuity(precedingSimilarity, followingSimilarity) };
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function assertNoRenderedFlashes(videoPath: string, fps = 24): void {
  const flashes = auditRenderedFlashes(videoPath, fps).filter(finding => finding.continuity === "discontinuous");
  if (flashes.length) throw new Error(`Flash guard held this render: ${flashes.map(f => `${f.startFrame}-${f.endFrameExclusive - 1} (${f.frameCount} frames)`).join("; ")}. Extend adjacent approved coverage or request a producer-reviewed repair; do not auto-fill the interval.`);
}
