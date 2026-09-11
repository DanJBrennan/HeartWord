import { describe, expect, it } from "vitest";
import { crowdDuplicateSeverity, parseCriticPreserve, parseCriticSeverity, parseCriticSuggestedFix } from "./critic.js";

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
