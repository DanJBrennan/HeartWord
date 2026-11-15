import { describe, expect, it } from "vitest";
import { crowdDuplicateSeverity, formatCriticFindings, parseCriticFindings, parseCriticPreserve, parseCriticSeverity, parseCriticSuggestedFix } from "./critic.js";

describe("parseCriticSeverity", () => {
  it("parses each known severity level", () => {
    expect(parseCriticSeverity("Looks fine.\nSEVERITY: none")).toBe("none");
    expect(parseCriticSeverity("A small detail.\nSEVERITY: minor")).toBe("minor");
    expect(parseCriticSeverity("Worth fixing.\nSEVERITY: moderate")).toBe("moderate");
    expect(parseCriticSeverity("Clearly wrong.\nSEVERITY: severe")).toBe("severe");
  });

  it("is case-insensitive", () => {
    expect(parseCriticSeverity("SEVERITY: SEVERE")).toBe("severe");
    expect(parseCriticSeverity("Severity: Moderate")).toBe("moderate");
  });

  it("finds the severity line regardless of surrounding text", () => {
    const findings =
      "Long research findings here with citations.\n\nMore text.\n\nSEVERITY: moderate\n\n(end of response)";
    expect(parseCriticSeverity(findings)).toBe("moderate");
  });

  it("fails safe to moderate (not none) when no severity line is present", () => {
    expect(parseCriticSeverity("Just some findings with no severity line at all.")).toBe("moderate");
  });

  it("matches the real Capernaum-roof-height case this was built for", () => {
    const findings =
      "Archaeological excavations (Loffreda, Corbo) show first-century Capernaum houses had flat roofs with " +
      "ceilings under 3 meters, not the tall peaked/thatched structure depicted here.\nSEVERITY: severe";
    expect(parseCriticSeverity(findings)).toBe("severe");
  });
});

describe("crowdDuplicateSeverity", () => {
  it("escalates a copied crowd cluster of three or more", () => {
    expect(crowdDuplicateSeverity(1)).toBe("none");
    expect(crowdDuplicateSeverity(2)).toBe("moderate");
    expect(crowdDuplicateSeverity(3)).toBe("severe");
    expect(crowdDuplicateSeverity(5)).toBe("severe");
  });
});

describe("parseCriticSuggestedFix", () => {
  it("extracts a concrete suggested fix", () => {
    const findings = "The roof is pitched, not flat.\nSEVERITY: moderate\nSUGGESTED FIX: lower the roof pitch to flat construction\nPRESERVE: everything else";
    expect(parseCriticSuggestedFix(findings)).toBe("lower the roof pitch to flat construction");
  });

  it("returns null when the model wrote 'none'", () => {
    expect(parseCriticSuggestedFix("Looks good.\nSEVERITY: none\nSUGGESTED FIX: none\nPRESERVE: everything")).toBeNull();
  });

  it("returns null when no SUGGESTED FIX line is present", () => {
    expect(parseCriticSuggestedFix("SEVERITY: minor")).toBeNull();
  });

  it("strips surrounding quotes the model sometimes adds", () => {
    expect(parseCriticSuggestedFix('SUGGESTED FIX: "add scattered debris under the opening"')).toBe(
      "add scattered debris under the opening"
    );
  });
});

describe("parseCriticPreserve", () => {
  it("extracts what must not change", () => {
    const findings = "SEVERITY: moderate\nSUGGESTED FIX: lower the roof pitch\nPRESERVE: keep the crowd composition and Jesus's pose exactly as-is";
    expect(parseCriticPreserve(findings)).toBe("keep the crowd composition and Jesus's pose exactly as-is");
  });

  it("returns null when the model wrote 'everything'", () => {
    expect(parseCriticPreserve("SEVERITY: none\nPRESERVE: everything")).toBeNull();
  });

  it("returns null when no PRESERVE line is present", () => {
    expect(parseCriticPreserve("SEVERITY: severe")).toBeNull();
  });
});

describe("parseCriticFindings", () => {
  const finding = {
    finding: "The roof is pitched.", evidence: "The visible roof line rises to a ridge.", severity: "moderate",
    confidence: 0, limitations: "The rear wall is out of frame.", requestedAction: "Use a flat roof."
  } as const;

  it("keeps valid individual endpoint estimates, including 0 and 100", () => {
    const zero = parseCriticFindings(`FINDINGS_JSON: ${JSON.stringify({ findings: [finding] })}`);
    const hundred = parseCriticFindings(`FINDINGS_JSON: ${JSON.stringify({ findings: [{ ...finding, confidence: 100 }] })}`);
    expect(zero[0]?.confidence).toBe(0);
    expect(hundred[0]?.confidence).toBe(100);
  });

  it.each([-1, 101, Number.NaN, "90", undefined])("fails safe for malformed confidence %p", (confidence) => {
    expect(() => parseCriticFindings(`FINDINGS_JSON: ${JSON.stringify({ findings: [{ ...finding, confidence }] })}`)).toThrow();
  });

  it("requires every new finding to carry evidence, limitations, and requested action", () => {
    expect(() => parseCriticFindings('FINDINGS_JSON: {"findings":[{"finding":"bad roof","severity":"moderate","confidence":50}]}')).toThrow();
  });

  it("uses the persisted full payload when a report contains both model and augmented findings", () => {
    const text = `FINDINGS_JSON: ${JSON.stringify({ findings: [finding] })}\nCRITIC_FINDINGS_JSON: ${JSON.stringify({ findings: [{ ...finding, confidence: 100 }] })}`;
    expect(parseCriticFindings(text)[0]?.confidence).toBe(100);
  });

  it("formats confidence as advisory evidence, not a score that can decide the review", () => {
    expect(formatCriticFindings([{ ...finding, confidence: 100 }])).toContain("never a vote, authority, or gate override");
    expect(formatCriticFindings([{ ...finding, confidence: 100 }])).toContain("100/100 (uncalibrated)");
  });
});
