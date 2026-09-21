import type { CameraMovement, CrowdDensity, Framing } from "./coverage.js";

/**
 * How likely a shot is to need iteration before it's usable, derived from
 * facts the shot plan already carries. Two consumers, both cost decisions
 * (docs/design/media-generation.md's "Draft Room and Cost-Tiered
 * Generation", and PRODUCT_VISION.md's Cost Governance):
 *
 *   routine  -> cheapest render, straight to final.
 *   elevated -> mid render, worth a cheap draft to check composition first.
 *   critical -> best render, always draft first.
 *
 * Deliberately deterministic, not a model call: every other classification
 * in this stage (planCoverage, validateFraming, narrationBudgetFor) is a
 * documented rule over real data, and a risk score that costs a Gemini
 * call to obtain would undercut the saving it exists to produce.
 *
 * The factors are grounded in this project's own observed failures, not
 * invented:
 *  - Crowded frames are where Veo's RAI filter actually bit (a figure
 *    lying prone in a crowd, read as a medical emergency -- see
 *    generate-final-with-fallback.ts), and where the crowd-duplicate QC
 *    check (qc/critic.ts's largestIdenticalGroup) has work to do.
 *  - Many named characters in one frame means many likenesses to hold at
 *    once; the feasibility challenger flagged exactly this for Mark 3's
 *    "nine apostles in a single frame" shot.
 *  - A moving camera and a wider framing both put more of the scene on
 *    screen, so there is more that can come back wrong -- but only when
 *    there is actually a crowd in it, which is why neither counts on its
 *    own here.
 *
 * Thresholds were calibrated against Mark 3's real 18 non-dialogue shots
 * rather than chosen a priori, after a first attempt classified all 18 as
 * critical and so distinguished nothing while quadrupling spend. Two
 * candidate factors were dropped for carrying no information on real
 * data: continuity notes are set on 30 of 30 shots, and a "moderate"
 * crowd is also the fallback default (DEFAULT_CROWD_DENSITY), so neither
 * separates one shot from another. Cast size is the factor that actually
 * varies (2-9 per shot here) and is the one the feasibility challenger
 * independently flagged. Re-check this calibration against a quieter
 * chapter before trusting it beyond Mark-like material.
 *
 * What this deliberately does NOT do is guess emotional weight. Whether a
 * beat is the emotional centre of a passage is a real input to this
 * decision -- PRODUCT_VISION.md's cost tiering names "canon-critical or
 * emotionally important" shots explicitly -- but nothing in the shot row
 * carries it, and inferring it from framing or crowd size would be
 * fabrication. A shot can be escalated explicitly instead: see
 * `escalateToCritical`.
 */
export type ShotRiskTier = "routine" | "elevated" | "critical";

export interface ShotRiskFacts {
  framing: Framing | null;
  cameraMovement: CameraMovement | null;
  crowdDensity: CrowdDensity | null;
  /** Named canon characters visible in the shot. */
  characterCount: number;
}

export interface ShotRiskAssessment {
  tier: ShotRiskTier;
  /** Plain-language factors behind the tier, for the producer and for the
   *  generation attempt's own record -- a tier with no stated reason is
   *  not reviewable. */
  reasons: string[];
  /** Whether to spend a cheap draft before committing a full render. */
  draftFirst: boolean;
}

/** A frame holding this many named canon likenesses is a render risk on
 *  its own -- Mark 3's "remaining nine apostles gathered together" shot is
 *  the real example, and the one the feasibility challenger flagged. */
const HEAVY_CAST_COUNT = 6;
/** Enough faces that a packed crowd around them compounds the problem. */
const BUSY_CAST_COUNT = 5;
const MODERATE_CAST_COUNT = 4;

const MOVING_CAMERA: ReadonlySet<CameraMovement> = new Set(["tracking", "handheld_follow", "push_in", "pull_out"]);
const WIDE_FRAMINGS: ReadonlySet<Framing> = new Set(["wide", "medium_wide"]);

export function assessShotRisk(facts: ShotRiskFacts): ShotRiskAssessment {
  const packed = facts.crowdDensity === "packed";
  const moving = Boolean(facts.cameraMovement && MOVING_CAMERA.has(facts.cameraMovement));
  const wide = Boolean(facts.framing && WIDE_FRAMINGS.has(facts.framing));
  const reasons: string[] = [];

  let tier: ShotRiskTier = "routine";
  if (facts.characterCount >= HEAVY_CAST_COUNT) {
    tier = "critical";
    reasons.push(`${facts.characterCount} named characters in frame`);
  } else if (packed && facts.characterCount >= BUSY_CAST_COUNT) {
    tier = "critical";
    reasons.push(`${facts.characterCount} named characters in a packed crowd`);
  } else if (facts.characterCount >= MODERATE_CAST_COUNT) {
    tier = "elevated";
    reasons.push(`${facts.characterCount} named characters in frame`);
  } else if (packed && (moving || wide)) {
    tier = "elevated";
    reasons.push(`packed crowd in a ${moving ? `moving (${facts.cameraMovement})` : `wide (${facts.framing})`} shot`);
  }

  return {
    tier,
    reasons: reasons.length > 0 ? reasons : ["no elevated risk factors"],
    draftFirst: tier !== "routine"
  };
}

/**
 * Raises an assessment to critical for a reason the shot row cannot carry
 * -- an emotionally decisive beat, or a canon-critical likeness the
 * producer wants rendered at full quality regardless of how simple the
 * frame looks. Never lowers a tier: a structurally risky shot stays risky
 * whatever else is true of it.
 */
export function escalateToCritical(assessment: ShotRiskAssessment, reason: string): ShotRiskAssessment {
  if (!reason.trim()) throw new Error("Escalating a shot's risk tier requires a stated reason.");
  return {
    tier: "critical",
    reasons: [...assessment.reasons.filter(r => r !== "no elevated risk factors"), reason.trim()],
    draftFirst: true
  };
}
