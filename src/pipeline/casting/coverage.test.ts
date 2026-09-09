import { describe, expect, it } from "vitest";
import {
  computeDialogueDurationMs,
  MAX_SINGLE_CLIP_LIPSYNC_MS,
  planCoverage,
  validateFraming,
  isFraming,
  isCameraMovement,
  isCrowdDensity,
  verseRangesRelated
} from "./coverage.js";

describe("isCrowdDensity", () => {
  it("accepts every known density", () => {
    expect(isCrowdDensity("empty")).toBe(true);
    expect(isCrowdDensity("sparse")).toBe(true);
    expect(isCrowdDensity("moderate")).toBe(true);
    expect(isCrowdDensity("packed")).toBe(true);
  });

  it("rejects an unrecognized value", () => {
    expect(isCrowdDensity("crowded")).toBe(false);
    expect(isCrowdDensity("")).toBe(false);
  });
});

describe("validateFraming", () => {
  it("leaves a lip-sync-safe framing alone", () => {
    expect(validateFraming("close_up", true)).toEqual({ framing: "close_up", corrected: false });
    expect(validateFraming("medium_close", true)).toEqual({ framing: "medium_close", corrected: false });
    expect(validateFraming("insert", true)).toEqual({ framing: "insert", corrected: false });
  });

  it("leaves any framing alone when the shot doesn't need lip-sync", () => {
    expect(validateFraming("wide", false)).toEqual({ framing: "wide", corrected: false });
  });

  it("tightens a too-wide framing when lip-sync is needed", () => {
    const result = validateFraming("wide", true);
    expect(result.framing).toBe("medium_close");
    expect(result.corrected).toBe(true);
    expect(result.note).toMatch(/too wide for lip-sync/);
  });

  it("tightens 'medium' the same way as 'wide'", () => {
    const result = validateFraming("medium", true);
    expect(result.framing).toBe("medium_close");
    expect(result.corrected).toBe(true);
  });
});

describe("computeDialogueDurationMs", () => {
  it("sums segment durations", () => {
    expect(
      computeDialogueDurationMs([
        { startMs: 1000, endMs: 3000 },
        { startMs: 5000, endMs: 5500 }
      ])
    ).toBe(2500);
  });

  it("returns 0 for no segments", () => {
    expect(computeDialogueDurationMs([])).toBe(0);
  });

  it("never goes negative on a malformed segment", () => {
    expect(computeDialogueDurationMs([{ startMs: 5000, endMs: 4000 }])).toBe(0);
  });
});

describe("planCoverage", () => {
  it("plans a single clip when dialogue fits the ceiling", () => {
    expect(planCoverage(MAX_SINGLE_CLIP_LIPSYNC_MS)).toEqual({ coveragePlan: "single_clip", notes: null });
    expect(planCoverage(1000).coveragePlan).toBe("single_clip");
  });

  it("plans a covered sequence once dialogue exceeds the ceiling", () => {
    const result = planCoverage(MAX_SINGLE_CLIP_LIPSYNC_MS + 1);
    expect(result.coveragePlan).toBe("covered_sequence");
    expect(result.notes).toMatch(/covered sequence/);
    expect(result.notes).toMatch(/L-cut/);
  });

  it("describes a 20s speech as needing coverage, matching Jesus's Mark 2 teaching example", () => {
    const result = planCoverage(20000);
    expect(result.coveragePlan).toBe("covered_sequence");
    expect(result.notes).toContain("20.0s");
  });
});

describe("isFraming / isCameraMovement", () => {
  it("accepts known values and rejects unknown ones", () => {
    expect(isFraming("close_up")).toBe(true);
    expect(isFraming("extreme_close_up")).toBe(false);
    expect(isCameraMovement("push_in")).toBe(true);
    expect(isCameraMovement("zoom")).toBe(false);
  });
});

describe("verseRangesRelated", () => {
  it("matches an exact range", () => {
    expect(verseRangesRelated({ start: 10, end: 11 }, { start: 10, end: 11 })).toBe(true);
  });

  it("matches when one range is fully inside the other", () => {
    expect(verseRangesRelated({ start: 8, end: 9 }, { start: 8, end: 10 })).toBe(true);
    expect(verseRangesRelated({ start: 8, end: 10 }, { start: 8, end: 9 })).toBe(true);
  });

  it("rejects the real Scene 1 Shot 8 bug: adjacent ranges sharing only a boundary verse", () => {
    // Shot 8's own range (10-11) vs Shot 7's audio segment (8-10) -- these
    // share verse 10 as a boundary but are different shots' dialogue.
    expect(verseRangesRelated({ start: 10, end: 11 }, { start: 8, end: 10 })).toBe(false);
  });

  it("rejects a genuinely disjoint range", () => {
    expect(verseRangesRelated({ start: 20, end: 21 }, { start: 8, end: 10 })).toBe(false);
  });

  it("matches single-verse ranges exactly", () => {
    expect(verseRangesRelated({ start: 20, end: 20 }, { start: 20, end: 20 })).toBe(true);
  });
});
