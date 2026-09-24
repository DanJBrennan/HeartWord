import { describe, expect, it } from "vitest";
import { auditBoundaryIntegrity, safeQuietGapSnap } from "./boundary-integrity.js";

const RATE = 8000;

function recording(durationMs: number, active: Array<[number, number]>, clickMs?: number): Int16Array {
  const pcm = new Int16Array(durationMs * RATE / 1000);
  for (let i = 0; i < pcm.length; i++) {
    const ms = i * 1000 / RATE;
    // A modest recording bed that should not be mistaken for speech.
    const bed = 90 * Math.sin(2 * Math.PI * 63 * i / RATE);
    const voice = active.some(([start, end]) => ms >= start && ms < end)
      ? 8500 * Math.sin(2 * Math.PI * 190 * i / RATE) : 0;
    const click = clickMs !== undefined && ms >= clickMs && ms < clickMs + 10 ? 15000 : 0;
    pcm[i] = Math.round(bed + voice + click);
  }
  return pcm;
}

describe("source boundary integrity", () => {
  const pcm = recording(3000, [[0, 775], [1515, 2800]]);

  it("finds a cut inside renewed activity and points to the preceding quiet gap", () => {
    const findings = auditBoundaryIntegrity(pcm, RATE,
      [{ startMs: 0, endMs: 1733 }, { startMs: 1733, endMs: 3000 }], 1733);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ leftIndex: 0, rightIndex: 1, boundaryMs: 1733, atMaxSegmentLength: true });
    expect(findings[0]!.quietGap?.midpointMs).toBeGreaterThan(1050);
    expect(findings[0]!.quietGap?.midpointMs).toBeLessThan(1250);
    expect(findings[0]!.leftActivityDb).toBeGreaterThan(findings[0]!.activityThresholdDb);
    expect(findings[0]!.rightActivityDb).toBeGreaterThan(findings[0]!.activityThresholdDb);
    expect(safeQuietGapSnap(findings[0]!, { startMs: 0, endMs: 1733 }, { startMs: 1733, endMs: 3000 }))
      .toBe(findings[0]!.quietGap!.midpointMs);
  });

  it("does not hold a cut placed inside the quiet gap", () => {
    expect(auditBoundaryIntegrity(pcm, RATE,
      [{ startMs: 0, endMs: 1145 }, { startMs: 1145, endMs: 3000 }])).toEqual([]);
  });

  it("does not call an isolated edge click sustained activity", () => {
    const click = recording(3000, [[0, 800], [2100, 2800]], 1495);
    expect(auditBoundaryIntegrity(click, RATE,
      [{ startMs: 0, endMs: 1500 }, { startMs: 1500, endMs: 3000 }])).toEqual([]);
  });

  it("ignores noncontiguous intervals with a real gap between them", () => {
    expect(auditBoundaryIntegrity(pcm, RATE,
      [{ startMs: 0, endMs: 775 }, { startMs: 1515, endMs: 3000 }])).toEqual([]);
  });

  it("leaves a crossing without a substantial nearby gap advisory", () => {
    const continuous = recording(3000, [[0, 3000]]);
    const finding = auditBoundaryIntegrity(continuous, RATE,
      [{ startMs: 0, endMs: 1500 }, { startMs: 1500, endMs: 3000 }]);
    // Sustained level is not necessarily speech and may have no useful pause.
    expect(finding).toHaveLength(1);
    expect(safeQuietGapSnap(finding[0]!, { startMs: 0, endMs: 1500 }, { startMs: 1500, endMs: 3000 })).toBeNull();
  });
});
