import { describe, expect, it } from "vitest";
import { decideGenerationStatus } from "./director-verdict.js";

describe("decideGenerationStatus", () => {
  it("accepts a clean shot: no critic concern, both checks pass", () => {
    const decision = decideGenerationStatus({ criticSeverity: "none", likenessAligned: true, fidelityAligned: true });
    expect(decision.status).toBe("accepted");
  });

  it("accepts a shot with only a minor critic note and passing checks", () => {
    const decision = decideGenerationStatus({ criticSeverity: "minor", likenessAligned: true, fidelityAligned: true });
    expect(decision.status).toBe("accepted");
  });

  it("retries on a moderate critic concern even with passing checks", () => {
    const decision = decideGenerationStatus({ criticSeverity: "moderate", likenessAligned: true, fidelityAligned: true });
    expect(decision.status).toBe("retry_modified");
  });

  it("retries when exactly one automated check fails with no critic concern", () => {
    expect(decideGenerationStatus({ criticSeverity: "none", likenessAligned: false, fidelityAligned: true }).status).toBe(
      "retry_modified"
    );
    expect(decideGenerationStatus({ criticSeverity: "none", likenessAligned: true, fidelityAligned: false }).status).toBe(
      "retry_modified"
    );
  });

  it("holds for review when both automated checks fail", () => {
    const decision = decideGenerationStatus({ criticSeverity: "none", likenessAligned: false, fidelityAligned: false });
    expect(decision.status).toBe("hold_for_review");
  });

  it("escalates on a severe critic concern alone, even with passing checks", () => {
    const decision = decideGenerationStatus({ criticSeverity: "severe", likenessAligned: true, fidelityAligned: true });
    expect(decision.status).toBe("escalate");
  });

  it("does not let a high-confidence advisory score waive a blocking source/canon-style check", () => {
    // Confidence intentionally is not an input to this decision function:
    // severity and deterministic failed checks remain authoritative.
    const decision = decideGenerationStatus({ criticSeverity: "minor", likenessAligned: false, fidelityAligned: true });
    expect(decision.status).toBe("retry_modified");
  });

  it("holds for review when a severe critic concern coincides with a failing check", () => {
    const decision = decideGenerationStatus({ criticSeverity: "severe", likenessAligned: false, fidelityAligned: true });
    expect(decision.status).toBe("hold_for_review");
  });

  it("holds for review when a severe critic concern coincides with both checks failing", () => {
    const decision = decideGenerationStatus({ criticSeverity: "severe", likenessAligned: false, fidelityAligned: false });
    expect(decision.status).toBe("hold_for_review");
  });

  it("always returns a human-readable reasoning string", () => {
    const decision = decideGenerationStatus({ criticSeverity: "none", likenessAligned: true, fidelityAligned: true });
    expect(decision.reasoning.length).toBeGreaterThan(0);
  });

  it("keeps retrying a moderate concern below the automatic-retry limit", () => {
    expect(
      decideGenerationStatus({ criticSeverity: "moderate", likenessAligned: true, fidelityAligned: true, priorAttemptCount: 0 }).status
    ).toBe("retry_modified");
    expect(
      decideGenerationStatus({ criticSeverity: "moderate", likenessAligned: true, fidelityAligned: true, priorAttemptCount: 1 }).status
    ).toBe("retry_modified");
  });

  it("escalates to hold_for_review once a moderate concern has survived the retry limit", () => {
    const decision = decideGenerationStatus({ criticSeverity: "moderate", likenessAligned: true, fidelityAligned: true, priorAttemptCount: 2 });
    expect(decision.status).toBe("hold_for_review");
    expect(decision.reasoning).toContain("2 prior attempt");
  });

  it("escalates a lone failing check to hold_for_review once it has survived the retry limit", () => {
    const decision = decideGenerationStatus({ criticSeverity: "none", likenessAligned: false, fidelityAligned: true, priorAttemptCount: 3 });
    expect(decision.status).toBe("hold_for_review");
  });

  it("defaults priorAttemptCount to 0 when omitted, matching every existing call site", () => {
    const decision = decideGenerationStatus({ criticSeverity: "moderate", likenessAligned: true, fidelityAligned: true });
    expect(decision.status).toBe("retry_modified");
  });
});
