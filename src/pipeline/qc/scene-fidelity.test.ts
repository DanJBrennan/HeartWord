import { describe, expect, it } from "vitest";
import { isSceneFidelityAligned, parseFidelityVerdict, SETTING_FIDELITY_THRESHOLD } from "./fidelity-verdict.js";

describe("parseFidelityVerdict", () => {
  it("passes through a well-formed response", () => {
    expect(
      parseFidelityVerdict({ settingScore: 90, crowdDensityMatch: true, actionMatch: true, continuityViolation: false, notes: "Fine." })
    ).toEqual({ settingScore: 90, crowdDensityMatch: true, actionMatch: true, continuityViolation: false, notes: "Fine." });
  });

  it("clamps an out-of-range settingScore", () => {
    expect(parseFidelityVerdict({ settingScore: 150 }).settingScore).toBe(100);
    expect(parseFidelityVerdict({ settingScore: -20 }).settingScore).toBe(0);
  });

  it("fails safe to settingScore 0 when missing or non-numeric", () => {
    expect(parseFidelityVerdict({}).settingScore).toBe(0);
    expect(parseFidelityVerdict({ settingScore: "high" }).settingScore).toBe(0);
  });

  it("only treats an explicit true as a crowd density match", () => {
    expect(parseFidelityVerdict({ crowdDensityMatch: true }).crowdDensityMatch).toBe(true);
    expect(parseFidelityVerdict({ crowdDensityMatch: false }).crowdDensityMatch).toBe(false);
    expect(parseFidelityVerdict({}).crowdDensityMatch).toBe(false);
    expect(parseFidelityVerdict({ crowdDensityMatch: "yes" }).crowdDensityMatch).toBe(false);
  });

  it("only treats an explicit true as an action match", () => {
    expect(parseFidelityVerdict({ actionMatch: true }).actionMatch).toBe(true);
    expect(parseFidelityVerdict({ actionMatch: false }).actionMatch).toBe(false);
    expect(parseFidelityVerdict({}).actionMatch).toBe(false);
  });

  it("fails safe to assuming a continuity violation unless explicitly cleared", () => {
    expect(parseFidelityVerdict({ continuityViolation: false }).continuityViolation).toBe(false);
    expect(parseFidelityVerdict({ continuityViolation: true }).continuityViolation).toBe(true);
    expect(parseFidelityVerdict({}).continuityViolation).toBe(true);
  });

  it("fails safe on completely malformed input rather than throwing", () => {
    expect(parseFidelityVerdict(null)).toEqual({
      settingScore: 0,
      crowdDensityMatch: false,
      actionMatch: false,
      continuityViolation: true,
      notes: "(no notes returned)"
    });
  });

  it("defaults notes when missing or blank", () => {
    expect(parseFidelityVerdict({}).notes).toBe("(no notes returned)");
    expect(parseFidelityVerdict({ notes: "   " }).notes).toBe("(no notes returned)");
  });
});

describe("isSceneFidelityAligned", () => {
  const good = { settingScore: 90, crowdDensityMatch: true, actionMatch: true, continuityViolation: false, notes: "" };

  it("passes when every dimension passes", () => {
    expect(isSceneFidelityAligned(good)).toBe(true);
  });

  it("fails on a low setting score alone, even if everything else passes", () => {
    expect(isSceneFidelityAligned({ ...good, settingScore: SETTING_FIDELITY_THRESHOLD - 1 })).toBe(false);
  });

  it("fails on a crowd density mismatch alone, even with a perfect setting score", () => {
    expect(isSceneFidelityAligned({ ...good, crowdDensityMatch: false })).toBe(false);
  });

  it("fails when the image depicts a different planned moment", () => {
    expect(isSceneFidelityAligned({ ...good, actionMatch: false })).toBe(false);
  });

  it("fails on a continuity violation alone, even with everything else perfect", () => {
    expect(isSceneFidelityAligned({ ...good, continuityViolation: true })).toBe(false);
  });

  it("matches the real tribal-clothing failure this check was built for", () => {
    // The seashore shot: grass skirts, bare chests, shell/bone arm bands --
    // not borderline, so this should score clearly low.
    expect(isSceneFidelityAligned({ settingScore: 15, crowdDensityMatch: true, actionMatch: true, continuityViolation: false, notes: "" })).toBe(
      false
    );
  });

  it("matches the real premature-roof-opening failure this check was built for", () => {
    expect(isSceneFidelityAligned({ settingScore: 90, crowdDensityMatch: true, actionMatch: true, continuityViolation: true, notes: "" })).toBe(
      false
    );
  });
});
