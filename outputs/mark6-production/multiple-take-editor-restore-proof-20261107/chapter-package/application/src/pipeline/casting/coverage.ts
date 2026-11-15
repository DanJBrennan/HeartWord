/**
 * Pure camera/coverage logic for stage 3 (casting & direction) -- separated
 * from index.ts's Gemini/database glue so it's directly testable, same
 * pattern as src/pipeline/scene-breakdown/build-scenes.ts. See index.ts for
 * how this plugs into the real pipeline.
 *
 * Two decisions live here, both driven by a real constraint rather than left
 * to a generation model's defaults (see docs/plans/CURRENT_GOAL.md's camera-
 * language discussion for the full reasoning):
 *
 * 1. Lip-sync forces framing. Kling's Avatar API lip-syncs a character's
 *    face against a headshot -- it needs to actually see the mouth move, so
 *    any shot carrying lip-synced dialogue can't be a wide or medium
 *    framing; it has to be medium-close or tighter. Gemini is asked for a
 *    framing directly, but its answer isn't trusted blindly: a shot flagged
 *    needsLipSync with too-wide a framing gets corrected here, the same way
 *    index.ts already doesn't trust Gemini's character names unconditionally.
 *
 * 2. Coverage for long dialogue. A lip-synced shot whose real dialogue
 *    runs longer than fits one generated clip (Veo 3.1's stated single-clip
 *    ceiling) can't just be one long lip-synced take. It needs to become a
 *    short covered sequence instead: a wide master (establishes geography,
 *    no lip-sync needed), tight lip-synced inserts on the emphasis lines
 *    only, and cutaways to listeners/reactions in between -- all playing
 *    under one continuous audio segment (an L-cut: the dialogue audio never
 *    stops, only the picture cuts). This module only detects and describes
 *    that need using real audio-segment durations from stage 1 -- it does
 *    not build the covered sequence itself. That's stage 4/5's job once
 *    media generation exists: `clips` is already a separate table from
 *    `shots` for exactly this reason (one planned shot legitimately becomes
 *    several clips on the timeline).
 *
 *    Per Dan's explicit direction (2026-09-10): only the tight lip-synced
 *    insert beats actually need Kling's Avatar lip-sync API at all -- the
 *    wide master and the cutaway/reaction beats never show the speaker's
 *    mouth, so they should be generated through the REGULAR video pipeline
 *    (generateFinalVideoWithFallback's Veo/Kling-scene/draft chain), not
 *    Kling's Avatar API. Two real reasons, not just avoiding an unneeded
 *    call: it sidesteps Kling Avatar's own ~8-10s single-clip ceiling for
 *    every beat that isn't a close-up (a wide/cutaway beat can run as long
 *    as the regular pipeline's own limits allow instead), and it's a
 *    genuinely more interesting cut for the viewer than holding on the same
 *    lip-synced close-up for an entire long speech. When stage 4/5 build a
 *    covered sequence's beats, only mark `needsLipSync` on the tight-insert
 *    beats -- the master and cutaways get `needsLipSync: false` even though
 *    they belong to a shot whose overall `dialogue_character_id` is set.
 */

export type Framing = "wide" | "medium_wide" | "medium" | "medium_close" | "close_up" | "insert";
/** How full a shot's location should read -- grounded in the verse text
 *  rather than left for media generation to infer from prose alone. Added
 *  2026-09-06 after Dan caught Mark 2:1-2's "no room, not even at the
 *  door" rendering as a modestly-sized gathering: the text said crowded,
 *  but nothing told the image generator HOW crowded, so it under-populated
 *  the room. */
export type CrowdDensity = "empty" | "sparse" | "moderate" | "packed";
export type CameraMovement =
  | "static"
  | "push_in"
  | "pull_out"
  | "pan_left"
  | "pan_right"
  | "tracking"
  | "handheld_follow";
export type CoveragePlan = "single_clip" | "covered_sequence";

export const FRAMINGS: Framing[] = ["wide", "medium_wide", "medium", "medium_close", "close_up", "insert"];
export const CAMERA_MOVEMENTS: CameraMovement[] = [
  "static",
  "push_in",
  "pull_out",
  "pan_left",
  "pan_right",
  "tracking",
  "handheld_follow"
];

export const DEFAULT_FRAMING: Framing = "medium";
export const DEFAULT_CAMERA_MOVEMENT: CameraMovement = "static";

export const CROWD_DENSITIES: CrowdDensity[] = ["empty", "sparse", "moderate", "packed"];
export const DEFAULT_CROWD_DENSITY: CrowdDensity = "moderate";

export function isCrowdDensity(value: string): value is CrowdDensity {
  return (CROWD_DENSITIES as string[]).includes(value);
}

/** Framings tight enough to actually see a character's mouth move -- the
 *  only framings Kling's Avatar API can lip-sync against. */
const LIP_SYNC_SAFE_FRAMINGS: ReadonlySet<Framing> = new Set(["medium_close", "close_up", "insert"]);

/** Veo 3.1's stated single-clip ceiling. A lip-synced shot whose dialogue
 *  runs longer than this can't be generated as one clip -- see
 *  planCoverage below. Kept as a named constant since it's a provider
 *  limit, not a creative choice, and will need revisiting if the provider
 *  or its limits change. */
export const MAX_SINGLE_CLIP_LIPSYNC_MS = 8000;

export function isFraming(value: string): value is Framing {
  return (FRAMINGS as string[]).includes(value);
}

export function isCameraMovement(value: string): value is CameraMovement {
  return (CAMERA_MOVEMENTS as string[]).includes(value);
}

export interface FramingValidationResult {
  framing: Framing;
  corrected: boolean;
  note?: string;
}

/**
 * Enforces the lip-sync-forces-framing constraint. If a shot needs
 * lip-sync but was given a framing too wide to show the mouth clearly,
 * tightens it to 'medium_close' (the widest framing still considered
 * lip-sync-safe) rather than trusting the model's framing choice
 * unconditionally.
 */
export function validateFraming(framing: Framing, needsLipSync: boolean): FramingValidationResult {
  if (!needsLipSync || LIP_SYNC_SAFE_FRAMINGS.has(framing)) {
    return { framing, corrected: false };
  }
  return {
    framing: "medium_close",
    corrected: true,
    note: `framing "${framing}" is too wide for lip-sync (Kling's Avatar API needs a clear view of the mouth) -- tightened to "medium_close"`
  };
}

export interface DialogueSegment {
  startMs: number;
  endMs: number;
}

/** Sums real audio-segment durations for one shot's dialogue -- not an
 *  LLM's guess at how long a line takes to say. */
export function computeDialogueDurationMs(segments: DialogueSegment[]): number {
  return segments.reduce((total, seg) => total + Math.max(0, seg.endMs - seg.startMs), 0);
}

export interface VerseRange {
  start: number;
  end: number;
}

/**
 * Whether two verse ranges are close enough that one is the other's
 * dialogue -- deliberately CONTAINMENT, not plain interval overlap.
 * Fixed 2026-09-09 after a real bug: Scene 1 Shot 8 (verse range 10-11)
 * matched against Shot 7's own audio segment (verse range 8-10) under a
 * naive overlap check (`start <= end && end >= start`), because both
 * ranges touch verse 10 as a shared boundary -- adjacent verse-range
 * labels routinely share exactly one boundary vertex like this (one
 * segment's audio ends partway through verse 10, the next begins where
 * it left off), and plain overlap treats that shared vertex as "these
 * two ranges are the same dialogue." That doubled Shot 8's real 18.8s of
 * audio into a wrongly-computed 36.8s, which then produced 4 real,
 * already-approved keyframes for a duration that didn't belong to the
 * shot at all. Containment doesn't have this failure mode: a segment
 * only counts if it's the shot's own dialogue (one range wholly inside
 * the other), not merely adjacent to it.
 */
export function verseRangesRelated(a: VerseRange, b: VerseRange): boolean {
  return (a.start >= b.start && a.end <= b.end) || (b.start >= a.start && b.end <= a.end);
}

export interface CoveragePlanResult {
  coveragePlan: CoveragePlan;
  notes: string | null;
}

/**
 * Decides whether a lip-synced shot's real dialogue duration fits one
 * generated clip, or needs to become a covered sequence -- see this file's
 * header for what that means and why. Only meaningful for a shot where
 * needsLipSync is true; a shot with no lip-synced dialogue has nothing to
 * cover.
 */
export function planCoverage(dialogueDurationMs: number): CoveragePlanResult {
  if (dialogueDurationMs <= MAX_SINGLE_CLIP_LIPSYNC_MS) {
    return { coveragePlan: "single_clip", notes: null };
  }
  const seconds = (dialogueDurationMs / 1000).toFixed(1);
  return {
    coveragePlan: "covered_sequence",
    notes:
      `${seconds}s of continuous dialogue -- longer than one generated clip can hold. Plan as a covered sequence ` +
      `when stage 4/5 build this shot: one wide master (establishes geography, no lip-sync needed), tight ` +
      `lip-synced inserts on the emphasis lines only, and cutaways to listeners/reactions in between -- all ` +
      `playing under this shot's one continuous dialogue audio (an L-cut: the audio never stops, only the ` +
      `picture cuts). Only the tight inserts need Kling's Avatar lip-sync API -- generate the master and every ` +
      `cutaway/reaction beat through the regular video pipeline instead, since they never show the speaker's ` +
      `mouth. That also sidesteps Kling Avatar's own ~8-10s per-clip ceiling for those beats.`
  };
}
