import { describe, expect, it } from "vitest";
import { selectBoundaries } from "./select-boundaries.js";

describe("selectBoundaries", () => {
  it("returns one segment spanning the whole audio when only one segment is needed", () => {
    const result = selectBoundaries([], 1, 10_000);
    expect(result).toEqual([{ startMs: 0, endMs: 10_000, confidence: null }]);
  });

  it("picks the longest gaps, in chronological order, as internal boundaries", () => {
    const gaps = [
      { startMs: 1_000, endMs: 1_600, durationMs: 600 }, // short, near the start
      { startMs: 5_000, endMs: 7_000, durationMs: 2_000 }, // longest
      { startMs: 8_000, endMs: 8_500, durationMs: 500 } // short, near the end
    ];
    // 2 segments needs exactly 1 internal boundary: the longest gap (5000-7000).
    const result = selectBoundaries(gaps, 2, 10_000);
    expect(result).toHaveLength(2);
    expect(result[0]!.startMs).toBe(0);
    expect(result[0]!.endMs).toBe(6_000); // gap midpoint
    expect(result[1]!.startMs).toBe(6_000);
    expect(result[1]!.endMs).toBe(10_000);
  });

  it("marks the chapter's first and last boundary as certain (null confidence) when there is only one segment", () => {
    const result = selectBoundaries([], 1, 5_000);
    expect(result[0]!.confidence).toBeNull();
  });

  it("throws if there are fewer candidate gaps than boundaries needed", () => {
    const gaps = [{ startMs: 1_000, endMs: 1_500, durationMs: 500 }];
    expect(() => selectBoundaries(gaps, 3, 10_000)).toThrow(/Not enough detected silence gaps/);
  });

  it("scores every internal boundary below 80 -- gap duration alone should never auto-decide", () => {
    const gaps = [
      { startMs: 1_000, endMs: 4_000, durationMs: 3_000 },
      { startMs: 6_000, endMs: 6_600, durationMs: 600 }
    ];
    const result = selectBoundaries(gaps, 3, 10_000);
    for (const segment of result) {
      if (segment.confidence !== null) expect(segment.confidence).toBeLessThan(80);
    }
  });
});
