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
});
