import { describe, expect, it } from "vitest";
import { planCoverageBeats } from "./coverage-manifest.js";
import { MAX_SINGLE_CLIP_LIPSYNC_MS } from "./coverage.js";

function totalDurationMs(beats: ReturnType<typeof planCoverageBeats>): number {
  return beats.reduce((sum, b) => sum + b.durationMs, 0);
}

describe("planCoverageBeats", () => {
  it("returns nothing for zero duration", () => {
    expect(planCoverageBeats(0)).toEqual([]);
  });

  it("starts with a master and ends with a lip-sync insert", () => {
    const beats = planCoverageBeats(18019); // Scene 1 Shot 7, Mark 2:8-10
    expect(beats[0].beatType).toBe("master");
    expect(beats[0].needsLipSync).toBe(false);
    expect(beats.at(-1)!.beatType).toBe("lip_sync_insert");
    expect(beats.at(-1)!.needsLipSync).toBe(true);
  });

  it("never places a cutaway last", () => {
    for (const durationMs of [8001, 12000, 18019, 22384, 29443, 36768, 76719]) {
      const beats = planCoverageBeats(durationMs);
      expect(beats.at(-1)!.beatType).not.toBe("cutaway");
    }
  });

  it("covers the full dialogue duration with no gaps or overlaps", () => {
    for (const durationMs of [8001, 12000, 18019, 22384, 29443, 36768, 76719]) {
      const beats = planCoverageBeats(durationMs);
      expect(totalDurationMs(beats)).toBe(durationMs);
      for (let i = 1; i < beats.length; i++) {
        expect(beats[i].audioStartMs).toBe(beats[i - 1].audioEndMs);
        expect(beats[i].sequence).toBe(beats[i - 1].sequence + 1);
      }
      expect(beats[0].audioStartMs).toBe(0);
      expect(beats.at(-1)!.audioEndMs).toBe(durationMs);
    }
  });

  it("keeps every beat under Veo's single-clip ceiling", () => {
    const beats = planCoverageBeats(76719); // Scene 3 Shots 3-6, Mark 2:19-22
    for (const beat of beats) {
      expect(beat.durationMs).toBeLessThanOrEqual(MAX_SINGLE_CLIP_LIPSYNC_MS);
    }
  });

  it("only the first lip-sync insert reuses the existing keyframe", () => {
    const beats = planCoverageBeats(36768); // Scene 1 Shot 8, Mark 2:10-11
    const inserts = beats.filter((b) => b.beatType === "lip_sync_insert");
    expect(inserts.length).toBeGreaterThan(1);
    expect(inserts[0].requiresNewKeyframe).toBe(false);
    for (const insert of inserts.slice(1)) {
      expect(insert.requiresNewKeyframe).toBe(true);
    }
  });

  it("every master and cutaway beat requires a new keyframe", () => {
    const beats = planCoverageBeats(76719);
    for (const beat of beats.filter((b) => b.beatType !== "lip_sync_insert")) {
      expect(beat.requiresNewKeyframe).toBe(true);
    }
  });

  it("matches Dan's worked 4-beat example shape for an 18s speech", () => {
    const beats = planCoverageBeats(18019);
    expect(beats.map((b) => b.beatType)).toEqual(["master", "lip_sync_insert", "cutaway", "lip_sync_insert"]);
  });

  it("produces a longer coverage map of masters, cutaways, and several inserts for a 76.7s speech", () => {
    const beats = planCoverageBeats(76719);
    const inserts = beats.filter((b) => b.beatType === "lip_sync_insert");
    const cutaways = beats.filter((b) => b.beatType === "cutaway");
    expect(beats[0].beatType).toBe("master");
    expect(inserts.length).toBeGreaterThanOrEqual(3);
    expect(cutaways.length).toBeGreaterThanOrEqual(2);
  });

  it("never produces a lip-sync insert under 1.5s except when it's the only insert", () => {
    for (const durationMs of [8001, 12000, 18019, 22384, 29443, 36768, 76719]) {
      const beats = planCoverageBeats(durationMs);
      const inserts = beats.filter((b) => b.beatType === "lip_sync_insert");
      for (const insert of inserts) {
        if (inserts.length > 1) {
          expect(insert.durationMs).toBeGreaterThanOrEqual(1500);
        }
      }
    }
  });
});
