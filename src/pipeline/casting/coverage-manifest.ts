/**
 * Coverage BEAT planning -- the next layer down from coverage.ts's
 * planCoverage(). planCoverage only detects that a lip-synced shot's real
 * dialogue is too long for one clip and writes a human-readable note
 * (shots.coverage_notes); it deliberately stops short of saying what the
 * actual sequence of clips should be (see its own docstring: "this module
 * only detects and describes that need... stage 4/5's job once media
 * generation exists"). This module is that stage 4/5 job: turning a
 * covered_sequence shot's total dialogue duration into a concrete, ordered
 * list of beats -- an L-cut coverage map -- built 2026-09-08 per Dan's
 * plan (relayed from a Codex planning conversation) for how to shoot an
 * 18-77s continuous speech without ever generating one long video clip:
 *
 *   "We should treat a long dialogue shot as one audio span with multiple
 *   visual clips, never as one 18-77 second video generation... covered
 *   with clips under eight seconds: a wide master, close lip-sync inserts
 *   for emphasis, and reaction/cutaway clips in between while the audio
 *   continues. Every clip is muted in assembly except for the continuous
 *   source narration."
 *
 * The beat pattern this produces -- one opening master (no lip-sync),
 * then lip-sync insert / cutaway pairs, always ending on a lip-sync insert
 * so the line lands on the speaker -- mirrors Dan's own worked example for
 * Scene 1 Shot 7's 18s speech (master, insert, cutaway, insert) and
 * generalizes it to the 22-77s speeches by repeating the insert/cutaway
 * pair until the dialogue is fully covered.
 *
 * Cut POINTS here are proportional slices of the total duration, not real
 * phrase boundaries -- this module has no access to the actual audio
 * waveform, only its total length. Every beat's audio range should be
 * refined against real silence/phrase boundaries (the same
 * detect-silences.ts + select-boundaries.ts heuristic already used for
 * verse-group ingestion) before a beat is actually generated, exactly the
 * same "structurally correct now, confidence-capped pending refinement"
 * pattern select-boundaries.ts already uses elsewhere in this pipeline.
 * That refinement is a separate, later pass -- see coverage_beats'
 * `audio_confidence` column.
 */

import { MAX_SINGLE_CLIP_LIPSYNC_MS } from "./coverage.js";

export type CoverageBeatType = "master" | "lip_sync_insert" | "cutaway";

/** Target/ceiling durations per beat type, all comfortably under Veo's
 *  ~8s single-clip ceiling (MAX_SINGLE_CLIP_LIPSYNC_MS) so a beat never
 *  itself needs re-splitting. Kept well under 8000ms, not right at it, so
 *  there's slack for the real cut point to land on a phrase boundary a
 *  little earlier or later than the proportional estimate. */
const MASTER_TARGET_MS = 3500;
const LIP_SYNC_INSERT_MAX_MS = 7000;
const CUTAWAY_TARGET_MS = 3000;

export interface CoverageBeatPlan {
  /** 1-based position in the shot's coverage sequence. */
  sequence: number;
  beatType: CoverageBeatType;
  /** Offset from the start of the shot's dialogue audio, ms. */
  audioStartMs: number;
  audioEndMs: number;
  durationMs: number;
  needsLipSync: boolean;
  /** False only for the first lip-sync insert, which can reuse the shot's
   *  already-approved keyframe as its anchor (Dan: "the current dialogue
   *  keyframe remains one anchor, not the whole visual treatment") --
   *  every other beat needs a new keyframe generated for it. */
  requiresNewKeyframe: boolean;
  notes: string;
}

/**
 * Builds the ordered beat plan for one covered_sequence shot's total real
 * dialogue duration. Precondition: dialogueDurationMs must already exceed
 * MAX_SINGLE_CLIP_LIPSYNC_MS (i.e. coverage.ts's planCoverage() returned
 * "covered_sequence") -- this function doesn't re-check that itself, since
 * its caller already has that decision and the ceiling is coverage.ts's
 * concern, not this module's.
 *
 * Shape: one opening master (establishes geography, no lip-sync), then
 * repeating [lip_sync_insert, cutaway] pairs consuming the remaining
 * dialogue, always ending on a lip_sync_insert -- a cutaway is never the
 * last beat, so the speech lands back on the speaker rather than cutting
 * away right as it concludes.
 */
export function planCoverageBeats(dialogueDurationMs: number): CoverageBeatPlan[] {
  if (dialogueDurationMs <= 0) return [];

  const beats: CoverageBeatPlan[] = [];
  let cursorMs = 0;
  let sequence = 1;

  const push = (beatType: CoverageBeatType, durationMs: number, needsLipSync: boolean, notes: string) => {
    beats.push({
      sequence: sequence++,
      beatType,
      audioStartMs: cursorMs,
      audioEndMs: cursorMs + durationMs,
      durationMs,
      needsLipSync,
      requiresNewKeyframe: beatType !== "lip_sync_insert" || beats.some((b) => b.beatType === "lip_sync_insert"),
      notes
    });
    cursorMs += durationMs;
  };

  const masterMs = Math.min(MASTER_TARGET_MS, dialogueDurationMs);
  push(
    "master",
    masterMs,
    false,
    "Wide master establishing geography and staging before the speech -- no lip-sync needed; can be a new wide " +
      "coverage keyframe or an existing establishing shot for this scene."
  );

  const remainingForInserts = dialogueDurationMs - masterMs;
  if (remainingForInserts <= 0) return beats;

  // Find the minimal number of lip-sync inserts N such that, once N-1
  // fixed-length cutaways sit between them, each insert's even share of
  // what's left still fits under LIP_SYNC_INSERT_MAX_MS. Solving for N up
  // front (rather than greedily maxing out each insert and patching the
  // leftover afterward) avoids ever producing a too-short trailing insert
  // or -- worse -- pushing a fix-up beat over the single-clip ceiling.
  let insertCount = 1;
  while ((remainingForInserts - (insertCount - 1) * CUTAWAY_TARGET_MS) / insertCount > LIP_SYNC_INSERT_MAX_MS) {
    insertCount++;
  }

  const totalCutawayMs = (insertCount - 1) * CUTAWAY_TARGET_MS;
  const totalInsertMs = remainingForInserts - totalCutawayMs;
  const baseInsertMs = Math.floor(totalInsertMs / insertCount);
  const extraMsToDistribute = totalInsertMs - baseInsertMs * insertCount;

  for (let i = 0; i < insertCount; i++) {
    const isFirstInsert = i === 0;
    const insertMs = baseInsertMs + (i < extraMsToDistribute ? 1 : 0);
    push(
      "lip_sync_insert",
      insertMs,
      true,
      isFirstInsert
        ? "Close lip-sync insert -- reuse the shot's existing approved keyframe as the anchor for this beat."
        : "Close lip-sync insert -- generate a fresh keyframe (same character/wardrobe/setting) for this beat."
    );
    if (i < insertCount - 1) {
      push(
        "cutaway",
        CUTAWAY_TARGET_MS,
        false,
        "Brief reaction/cutaway (a listener, a scribe, the paralytic) while the dialogue audio continues " +
          "uninterrupted -- new keyframe required, framing distinct from the speaker's insert shots."
      );
    }
  }

  return beats;
}
