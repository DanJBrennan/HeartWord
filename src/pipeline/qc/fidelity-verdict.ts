/**
 * Pure logic for the scene-fidelity check (setting/costume/continuity),
 * split out from scene-fidelity.ts for the same reason likeness-verdict.ts
 * is split from canonical-likeness.ts: zero DB/network imports, so a
 * plain vitest unit test doesn't pull in db/client.ts's node:sqlite.
 */

/** 0-100. Below this, a shot's setting/costume is flagged as not reading
 *  as first-century Judea (e.g. drifted toward the casting region's own
 *  culture instead of staying purely a facial/skin-tone choice). */
export const SETTING_FIDELITY_THRESHOLD = 70;

export interface FidelityVerdict {
  settingScore: number;
  crowdDensityMatch: boolean;
  continuityViolation: boolean;
  notes: string;
}

/**
 * Validates and clamps the model's raw JSON response -- same distrust-and-
 * validate pattern as likeness-verdict.ts's parseLikenessVerdict and
 * casting/index.ts's framing/camera validation. A malformed or missing
 * field fails safe: an unreadable settingScore is treated as low (0), and
 * an unreadable boolean is treated as a violation/mismatch, so a garbled
 * response gets a human's attention rather than silently passing.
 */
export function parseFidelityVerdict(raw: unknown): FidelityVerdict {
  const obj = (raw && typeof raw === "object" ? raw : {}) as {
    settingScore?: unknown;
    crowdDensityMatch?: unknown;
    continuityViolation?: unknown;
    notes?: unknown;
  };
  const rawScore = typeof obj.settingScore === "number" && Number.isFinite(obj.settingScore) ? obj.settingScore : 0;
  const settingScore = Math.max(0, Math.min(100, rawScore));
  const crowdDensityMatch = obj.crowdDensityMatch === true;
  const continuityViolation = obj.continuityViolation !== false; // fail safe: assume a violation unless explicitly cleared
  const notes = typeof obj.notes === "string" && obj.notes.trim().length > 0 ? obj.notes.trim() : "(no notes returned)";
  return { settingScore, crowdDensityMatch, continuityViolation, notes };
}

/** A shot passes only if every dimension passes -- one bad dimension
 *  (wrong costume, wrong crowd size, a continuity break) is a real
 *  failure even if the other two are fine. */
export function isSceneFidelityAligned(verdict: FidelityVerdict, threshold: number = SETTING_FIDELITY_THRESHOLD): boolean {
  return verdict.settingScore >= threshold && verdict.crowdDensityMatch && !verdict.continuityViolation;
}
