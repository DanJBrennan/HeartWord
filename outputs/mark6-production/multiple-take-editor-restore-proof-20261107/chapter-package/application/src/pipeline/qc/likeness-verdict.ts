/**
 * Pure logic for the canonical-likeness check, split out from
 * canonical-likeness.ts specifically so it has zero DB/network imports --
 * canonical-likeness.ts pulls in db/client.ts (node:sqlite) and
 * media-generation/index.ts, which breaks vitest's module resolution for
 * a plain unit test (confirmed directly: canonical-likeness.test.ts
 * failed to load with "Failed to load url sqlite" before this split).
 * Same reasoning as coverage.ts/build-scenes.ts being separate from their
 * DB-touching callers.
 */

/** 0-100. Below this, a shot's depiction of a character is flagged as not
 *  reading as the same person and gets regenerated. Chosen as a workable
 *  starting point, not calibrated against a labeled dataset -- expect to
 *  revisit once this has run against more chapters. */
export const LIKENESS_THRESHOLD = 70;

/** Whether the named character's visible wardrobe matches the approved
 * reference. An obscured wardrobe is not a mismatch, but an unparseable
 * reviewer response must never quietly pass the wardrobe gate. */
export type WardrobeStatus = "match" | "mismatch" | "not_visible" | "unverified";

export interface LikenessVerdict {
  score: number;
  instanceCount: number;
  wardrobeStatus: WardrobeStatus;
  wardrobeNotes: string;
  notes: string;
}

/**
 * Validates and clamps the model's raw JSON response rather than trusting
 * it outright -- same distrust-and-validate pattern casting/index.ts uses
 * for Gemini's framing/camera fields. A malformed or out-of-range score
 * fails safe (treated as a low score, so an ambiguous response gets
 * flagged for a human rather than silently passing). instanceCount fails
 * safe to 1 (the common case) rather than 0, since a missing/malformed
 * count shouldn't itself trigger a duplicate-character flag.
 */
export function parseLikenessVerdict(raw: unknown): LikenessVerdict {
  const obj = (raw && typeof raw === "object" ? raw : {}) as {
    score?: unknown;
    instanceCount?: unknown;
    wardrobeStatus?: unknown;
    wardrobeNotes?: unknown;
    notes?: unknown;
  };
  const rawScore = typeof obj.score === "number" && Number.isFinite(obj.score) ? obj.score : 0;
  const score = Math.max(0, Math.min(100, rawScore));
  const instanceCount =
    typeof obj.instanceCount === "number" && Number.isFinite(obj.instanceCount) && obj.instanceCount >= 0
      ? Math.round(obj.instanceCount)
      : 1;
  const wardrobeStatus: WardrobeStatus =
    obj.wardrobeStatus === "match" || obj.wardrobeStatus === "mismatch" || obj.wardrobeStatus === "not_visible"
      ? obj.wardrobeStatus
      : "unverified";
  const wardrobeNotes =
    typeof obj.wardrobeNotes === "string" && obj.wardrobeNotes.trim().length > 0
      ? obj.wardrobeNotes.trim()
      : "(no wardrobe assessment returned)";
  const notes = typeof obj.notes === "string" && obj.notes.trim().length > 0 ? obj.notes.trim() : "(no notes returned)";
  return { score, instanceCount, wardrobeStatus, wardrobeNotes, notes };
}

/**
 * Pure threshold decision -- kept separate from parseLikenessVerdict so
 * each is independently testable and the threshold can be tuned without
 * touching response-parsing logic.
 *
 * expectedInstances defaults to 1 -- added 2026-09-06 after Dan caught a
 * real duplicate-Jesus bug (the same named individual rendered twice in
 * one shot) that the score-only version of this check couldn't catch: a
 * duplicate often scores WELL on likeness, since at least one copy (often
 * both) genuinely matches the reference -- fidelity of appearance and
 * correct instance count are different failure modes. Callers checking a
 * character who legitimately can appear multiple times (rare for a named
 * individual; more plausible for some staged scenarios) should pass the
 * real expected count instead of relying on the default.
 */
export function isLikenessAligned(
  score: number,
  threshold: number = LIKENESS_THRESHOLD,
  instanceCount: number = 1,
  expectedInstances: number = 1,
  wardrobeStatus: WardrobeStatus = "match"
): boolean {
  return score >= threshold && instanceCount === expectedInstances &&
    (wardrobeStatus === "match" || wardrobeStatus === "not_visible");
}
