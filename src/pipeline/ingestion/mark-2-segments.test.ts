import { describe, expect, it } from "vitest";
import { buildMark2Segments } from "./mark-2-segments.js";
import type { ScoredUtterance } from "./mark-2-acoustic-scoring.js";
import type { VerseRecord } from "./parse-source-text.js";

const acoustic = { peakHz: null, peakZ: null, peakTimeSec: null, beforeHz: null, afterHz: null, distinctVoice: false, bracketConfirmed: false, note: "n/a" };

function utterance(overrides: Partial<ScoredUtterance>): ScoredUtterance {
  return {
    id: "q1", verseStart: 1, verseEnd: 1, speakerLabel: "Test", speakerLegacyId: "jesus", vocalized: true,
    textConfidence: 90, evidencePhrase: "x", rationale: "y", hatamQuote: "z",
    refinedStartMs: 0, refinedEndMs: 1000, startCorroborated: true, endCorroborated: true,
    startConfidence: 55, endConfidence: 55, overallConfidence: 68, acoustic,
    ...overrides
  };
}

const verses: VerseRecord[] = Array.from({ length: 5 }, (_, i) => ({ verse: i + 1, text: "text", paragraphIndex: i }));

describe("buildMark2Segments", () => {
  it("fills narration before, between, and after quotes with no gaps or overlaps", () => {
    const scored = [
      utterance({ id: "q1", verseStart: 1, verseEnd: 1, refinedStartMs: 1_000, refinedEndMs: 2_000 }),
      utterance({ id: "q2", verseStart: 3, verseEnd: 3, refinedStartMs: 5_000, refinedEndMs: 6_000, speakerLegacyId: null })
    ];
    const segments = buildMark2Segments(scored, verses, 10_000, "mark", 2);

    let cursor = 0;
    for (const seg of segments) {
      expect(seg.startMs).toBe(cursor);
      expect(seg.endMs).toBeGreaterThan(seg.startMs);
      cursor = seg.endMs;
    }
    expect(cursor).toBe(10_000);
    expect(segments.map((s) => s.speakerLegacyId)).toEqual([null, "jesus", null, null, null]);
  });

  it("skips a zero-width narration gap for back-to-back quotes", () => {
    const scored = [
      utterance({ id: "q1", refinedStartMs: 0, refinedEndMs: 1_000 }),
      utterance({ id: "q2", refinedStartMs: 1_000, refinedEndMs: 2_000, speakerLegacyId: "matthew" })
    ];
    const segments = buildMark2Segments(scored, verses, 2_000, "mark", 2);
    expect(segments).toHaveLength(2);
    expect(segments.every((s) => s.speakerLegacyId !== null)).toBe(true);
  });

  it("resolves an overlap between consecutive quotes to their shared midpoint and flags both", () => {
    const scored = [
      utterance({ id: "q1", refinedStartMs: 0, refinedEndMs: 2_000, endCorroborated: true, overallConfidence: 90 }),
      utterance({ id: "q2", refinedStartMs: 1_000, refinedEndMs: 3_000, speakerLegacyId: "matthew", startCorroborated: true, overallConfidence: 90 })
    ];
    const segments = buildMark2Segments(scored, verses, 3_000, "mark", 2);

    // No overlap or gap in the final timeline, despite the conflicting input.
    let cursor = 0;
    for (const seg of segments) {
      expect(seg.startMs).toBe(cursor);
      cursor = seg.endMs;
    }
    expect(cursor).toBe(3_000);

    // Shared boundary lands at the midpoint of the original conflicting edges (1000, 2000) -> 1500.
    const q1seg = segments.find((s) => s.verseRef === "Mark 2:1")!;
    const q2seg = segments.find((s) => s.verseRef === "Mark 2:1" && s.speakerLegacyId === "matthew");
    expect(q1seg.endMs).toBe(1_500);

    // Both sides get flagged for review even though overallConfidence (90) alone wouldn't trigger it.
    expect(segments.some((s) => s.reviewNote?.includes("overlapped"))).toBe(true);
  });

  it("marks a segment for review only when its confidence is below 80", () => {
    const scored = [utterance({ overallConfidence: 95, startConfidence: 85, endConfidence: 85, refinedStartMs: 0, refinedEndMs: 10_000 })];
    const segments = buildMark2Segments(scored, verses, 10_000, "mark", 2);
    const quoteSeg = segments.find((s) => s.speakerLegacyId === "jesus")!;
    expect(quoteSeg.reviewNote).toBeNull();
  });

  it("folds a non-vocalized decision (e.g. silent reasoning) into surrounding narration rather than giving it its own segment", () => {
    const scored = [
      utterance({ id: "q1", verseStart: 1, verseEnd: 1, refinedStartMs: 1_000, refinedEndMs: 2_000 }),
      utterance({ id: "q2", verseStart: 2, verseEnd: 2, vocalized: false, speakerLegacyId: null }),
      utterance({ id: "q3", verseStart: 3, verseEnd: 3, refinedStartMs: 5_000, refinedEndMs: 6_000, speakerLegacyId: "matthew" })
    ];
    const segments = buildMark2Segments(scored, verses, 10_000, "mark", 2);
    expect(segments.filter((s) => s.speakerLegacyId !== null)).toHaveLength(2); // q2 never got its own segment
  });
});
