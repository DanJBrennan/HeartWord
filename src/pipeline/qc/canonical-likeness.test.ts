import { describe, expect, it } from "vitest";
import { isLikenessAligned, LIKENESS_THRESHOLD, parseLikenessVerdict } from "./likeness-verdict.js";

describe("parseLikenessVerdict", () => {
  it("passes through a well-formed response", () => {
    expect(parseLikenessVerdict({
      score: 85,
      instanceCount: 1,
      wardrobeStatus: "match",
      wardrobeNotes: "The mantle and bands match.",
      notes: "Strong match."
    })).toEqual({
      score: 85,
      instanceCount: 1,
      wardrobeStatus: "match",
      wardrobeNotes: "The mantle and bands match.",
      notes: "Strong match."
    });
  });

  it("clamps a score above 100", () => {
    expect(parseLikenessVerdict({ score: 150, notes: "x" }).score).toBe(100);
  });

  it("clamps a negative score to 0", () => {
    expect(parseLikenessVerdict({ score: -10, notes: "x" }).score).toBe(0);
  });

  it("fails safe to a score of 0 when score is missing or non-numeric", () => {
    expect(parseLikenessVerdict({ notes: "x" }).score).toBe(0);
    expect(parseLikenessVerdict({ score: "high", notes: "x" }).score).toBe(0);
    expect(parseLikenessVerdict({ score: NaN, notes: "x" }).score).toBe(0);
  });

  it("fails safe to instanceCount 1 (the common case) when missing or non-numeric", () => {
    expect(parseLikenessVerdict({ score: 90, notes: "x" }).instanceCount).toBe(1);
    expect(parseLikenessVerdict({ score: 90, instanceCount: "two", notes: "x" }).instanceCount).toBe(1);
    expect(parseLikenessVerdict({ score: 90, instanceCount: -1, notes: "x" }).instanceCount).toBe(1);
  });

  it("passes through a real duplicate-character count", () => {
    expect(parseLikenessVerdict({ score: 90, instanceCount: 2, notes: "x" }).instanceCount).toBe(2);
  });

  it("rounds a non-integer instanceCount", () => {
    expect(parseLikenessVerdict({ score: 90, instanceCount: 1.6, notes: "x" }).instanceCount).toBe(2);
  });

  it("fails safe on completely malformed input rather than throwing", () => {
    expect(parseLikenessVerdict(null)).toEqual({
      score: 0, instanceCount: 1, wardrobeStatus: "unverified", wardrobeNotes: "(no wardrobe assessment returned)", notes: "(no notes returned)"
    });
    expect(parseLikenessVerdict(undefined)).toEqual({
      score: 0, instanceCount: 1, wardrobeStatus: "unverified", wardrobeNotes: "(no wardrobe assessment returned)", notes: "(no notes returned)"
    });
    expect(parseLikenessVerdict("not an object")).toEqual({
      score: 0, instanceCount: 1, wardrobeStatus: "unverified", wardrobeNotes: "(no wardrobe assessment returned)", notes: "(no notes returned)"
    });
  });

  it("defaults notes when missing or blank", () => {
    expect(parseLikenessVerdict({ score: 90 }).notes).toBe("(no notes returned)");
    expect(parseLikenessVerdict({ score: 90, notes: "   " }).notes).toBe("(no notes returned)");
  });

  it("trims whitespace from real notes", () => {
    expect(parseLikenessVerdict({ score: 90, notes: "  looks good  " }).notes).toBe("looks good");
  });

  it("holds an absent or malformed wardrobe assessment as unverified", () => {
    expect(parseLikenessVerdict({ score: 90, wardrobeStatus: "unclear" }).wardrobeStatus).toBe("unverified");
    expect(parseLikenessVerdict({ score: 90, wardrobeStatus: "match", wardrobeNotes: "  correct mantle  " }).wardrobeNotes)
      .toBe("correct mantle");
  });
});

describe("isLikenessAligned", () => {
  it("passes a score at or above the default threshold with one instance", () => {
    expect(isLikenessAligned(LIKENESS_THRESHOLD)).toBe(true);
    expect(isLikenessAligned(100)).toBe(true);
  });

  it("fails a score below the default threshold", () => {
    expect(isLikenessAligned(LIKENESS_THRESHOLD - 1)).toBe(false);
    expect(isLikenessAligned(0)).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(isLikenessAligned(50, 40)).toBe(true);
    expect(isLikenessAligned(50, 60)).toBe(false);
  });

  it("matches the real drift case this check was built for: a clearly-off face scores well below threshold", () => {
    // Jesus's seashore-shot drift, described qualitatively by Dan and
    // confirmed by direct comparison against the canon headshot -- not a
    // borderline case, so this should fail clearly, not sit near the line.
    expect(isLikenessAligned(35)).toBe(false);
  });

  it("fails a duplicate character even with a perfect score", () => {
    // The real bug this dimension was added for: the same named
    // individual (Jesus) rendered twice in one shot, which the score-only
    // check couldn't catch because both copies genuinely matched the
    // reference.
    expect(isLikenessAligned(100, LIKENESS_THRESHOLD, 2)).toBe(false);
  });

  it("fails when the character doesn't appear at all", () => {
    expect(isLikenessAligned(0, LIKENESS_THRESHOLD, 0)).toBe(false);
  });

  it("passes exactly one instance at a good score", () => {
    expect(isLikenessAligned(90, LIKENESS_THRESHOLD, 1)).toBe(true);
  });

  it("respects a non-default expected instance count", () => {
    expect(isLikenessAligned(90, LIKENESS_THRESHOLD, 2, 2)).toBe(true);
    expect(isLikenessAligned(90, LIKENESS_THRESHOLD, 1, 2)).toBe(false);
  });

  it("fails a visible wardrobe mismatch even with a strong face match", () => {
    expect(isLikenessAligned(95, LIKENESS_THRESHOLD, 1, 1, "mismatch")).toBe(false);
  });

  it("allows an honestly obscured wardrobe but holds an unverified response", () => {
    expect(isLikenessAligned(95, LIKENESS_THRESHOLD, 1, 1, "not_visible")).toBe(true);
    expect(isLikenessAligned(95, LIKENESS_THRESHOLD, 1, 1, "unverified")).toBe(false);
  });
});
