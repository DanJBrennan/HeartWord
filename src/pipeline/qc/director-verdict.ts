/**
 * Pure logic for the Director agent: given the Critic's research-grounded
 * findings plus this codebase's existing automated checks
 * (canonical-likeness, scene-fidelity), decide what should actually happen
 * to a generated shot. Split out from director.ts for the same reason
 * likeness-verdict.ts/fidelity-verdict.ts are split from their callers --
 * zero DB/network imports, so a plain vitest unit test doesn't pull in
 * db/client.ts's node:sqlite.
 *
 * Built 2026-09-06 at Dan's request: "Whenever an image or video clip is
 * generated it should be reviewed by a critic agent... The director agent
 * weighs the input of the critic agent and determines if the criticisms
 * justify regenerating." The decision vocabulary is deliberately the
 * SAME `GenerationStatus` enum already defined in src/providers/types.ts
 * (accepted/retry_same/retry_modified/escalate/hold_for_review) --
 * ARCHITECTURE.md's provider interface and the QC review-outcome set in
 * docs/design/automated-quality-control.md already agreed on this
 * vocabulary before the Director existed; this is the first real code to
 * actually choose between all five, not just "accepted".
 */
import type { GenerationStatus } from "../../providers/types.js";

/** How serious the Critic judged its own findings, self-reported at the
 *  end of its grounded research (see critic.ts's parseCriticSeverity). */
export type CriticSeverity = "none" | "minor" | "moderate" | "severe";

export interface DirectorInputs {
  criticSeverity: CriticSeverity;
  /** true if every canonical-likeness check for this shot's characters
   *  passed (or none applied); false if any failed. */
  likenessAligned: boolean;
  /** true if the scene-fidelity check passed (or wasn't applicable);
   *  false if it failed. */
  fidelityAligned: boolean;
  /** How many prior 'generate' attempts this shot already has (before the
   *  one just reviewed) -- defaults to 0. Without this, a shot stuck on
   *  the same real, unfixed problem loops retry_modified forever: each
   *  attempt looks identical to the Director in isolation, since severity
   *  and the two checks say nothing about whether this is the 1st or 8th
   *  try. See MAX_AUTOMATIC_RETRIES below. */
  priorAttemptCount?: number;
}

/** A shot that would still only earn retry_modified after this many prior
 *  attempts escalates to hold_for_review instead -- repeated automatic
 *  retries aren't resolving it, so a human should look rather than spend
 *  another generation call on the same likely outcome. */
// One initial attempt plus up to five corrective attempts gives the
// standard -> Pro -> alternate-provider escalation path a fair chance while
// still returning a stubborn shot to the producer before a seventh paid image.
// Mark 4 producer authorization (Dan Brennan, 2026-09-25) expanded this
// ceiling by two corrective attempts.
export const MAX_AUTOMATIC_RETRIES = 5;

export interface DirectorDecision {
  status: GenerationStatus;
  reasoning: string;
}

/**
 * The actual weighing logic. A single "severe" critic finding outweighs
 * two passing automated checks -- research-grounded scriptural/historical
 * criticism is exactly the dimension neither existing check covers, so a
 * severe one is trusted at face value, not averaged away. Two failing
 * automated checks alongside real critic concerns escalates rather than
 * just retrying, since that pattern (multiple independent checks agreeing
 * something is wrong) is a stronger signal than any one check alone --
 * matching this codebase's general instinct that a hallucination/bug
 * compounding across multiple independent signals deserves a human, not
 * another blind automatic retry.
 */
export function decideGenerationStatus(inputs: DirectorInputs): DirectorDecision {
  const { criticSeverity, likenessAligned, fidelityAligned, priorAttemptCount = 0 } = inputs;
  const failedChecks = (likenessAligned ? 0 : 1) + (fidelityAligned ? 0 : 1);

  // The Critic is the visual judgment layer. When it explicitly reports no
  // concern, do not turn an opaque auxiliary-check disagreement into a paid
  // regeneration with no visible problem for the producer to assess.
  if (criticSeverity === "none") {
    return {
      status: "accepted",
      reasoning: "Critic reported no visible concern; auxiliary checks alone do not justify a regeneration."
    };
  }

  if (priorAttemptCount >= MAX_AUTOMATIC_RETRIES) {
    return {
      status: "hold_for_review",
      reasoning: `This shot already has ${priorAttemptCount} prior attempt(s) with an unresolved Critic concern; hold for a producer decision before another paid image.`
    };
  }

  if (criticSeverity === "severe" && failedChecks > 0) {
    return {
      status: "escalate",
      reasoning:
        "Critic raised a severe, research-grounded concern and an automated check agreed -- escalate the next automatic attempt."
    };
  }
  if (criticSeverity === "severe") {
    return {
      status: "escalate",
      reasoning: "Critic raised a severe, research-grounded concern on its own -- escalating rather than a plain retry."
    };
  }
  if (failedChecks === 2) {
    return {
      status: "escalate",
      reasoning: "Both canonical-likeness and scene-fidelity failed; escalate the next automatic attempt."
    };
  }
  if (criticSeverity === "moderate" || failedChecks === 1) {
    const baseReasoning =
      criticSeverity === "moderate"
        ? "Critic raised a moderate concern -- worth a regeneration attempt with a modified prompt."
        : "One automated check failed -- worth a regeneration attempt with a modified prompt.";
    return { status: "retry_modified", reasoning: baseReasoning };
  }
  return {
    status: "accepted",
    reasoning: "No severe/moderate critic concerns, and both automated checks passed (or didn't apply)."
  };
}
