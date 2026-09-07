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
}

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
  const { criticSeverity, likenessAligned, fidelityAligned } = inputs;
  const failedChecks = (likenessAligned ? 0 : 1) + (fidelityAligned ? 0 : 1);

  if (criticSeverity === "severe" && failedChecks > 0) {
    return {
      status: "hold_for_review",
      reasoning:
        "Critic raised a severe, research-grounded concern AND at least one automated check already failed -- " +
        "independent signals agreeing is a stronger case for a human look than another automatic retry."
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
      status: "hold_for_review",
      reasoning: "Both canonical-likeness and scene-fidelity failed on this shot -- multiple independent checks agreeing."
    };
  }
  if (criticSeverity === "moderate" || failedChecks === 1) {
    return {
      status: "retry_modified",
      reasoning:
        criticSeverity === "moderate"
          ? "Critic raised a moderate concern -- worth a regeneration attempt with a modified prompt."
          : "One automated check failed -- worth a regeneration attempt with a modified prompt."
    };
  }
  return {
    status: "accepted",
    reasoning: "No severe/moderate critic concerns, and both automated checks passed (or didn't apply)."
  };
}
