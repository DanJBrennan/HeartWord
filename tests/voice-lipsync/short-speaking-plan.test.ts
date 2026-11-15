import { describe, expect, it } from "vitest";
import { planShortSpeaking } from "../../src/pipeline/voice-lipsync/short-speaking-plan.js";

describe("short source-bound LTX speaking sections", () => {
  it("partitions an uneven long line without lost/repeated samples and carries the last retained picture", () => {
    const result = planShortSpeaking({ sampleRate: 44100, sampleCount: 432128,
      quiet: [{ startSample: 136000, endSample: 145000 }, { startSample: 277000, endSample: 285000 }] });
    expect(result.sections).toHaveLength(3);
    let sample = 0, frame = 0;
    for (const section of result.sections) {
      expect(section.sourceStartSample).toBe(sample); expect(section.pictureStartFrame).toBe(frame);
      expect(section.sourceEndSample - section.sourceStartSample).toBeLessThanOrEqual(4 * result.sampleRate);
      expect(section.tailPaddingSamples + section.sourceEndSample - section.sourceStartSample).toBe(5 * result.sampleRate);
      expect(section.lastRetainedFrameIndex).toBe(section.retainedFrames - 1);
      expect(section.reference).toEqual(section.index === 0 ? { kind: "approved_start" } : { kind: "previous_last_retained_frame", sectionIndex: section.index - 1 });
      sample = section.sourceEndSample; frame += section.retainedFrames;
    }
    expect(sample).toBe(result.sampleCount); expect(frame).toBe(result.totalFrames);
    expect(result.sections.slice(0, -1).every(s => s.boundaryReason.includes("measured source quiet"))).toBe(true);
    expect(result.assemblyAudio).toBe("one_continuous_original_full_line");
  });
  it("covers short/long and non-frame-aligned source endpoints at several original rates", () => {
    for (const sampleRate of [16000, 22050, 24000, 44100, 48000]) for (const duration of [.001, 2.7, 4, 4.001, 6.5, 9.798821, 12, 31.123]) {
      const sampleCount = Math.round(sampleRate * duration), plan = planShortSpeaking({ sampleRate, sampleCount });
      expect(plan.sections.reduce((sum, s) => sum + s.sourceEndSample - s.sourceStartSample, 0)).toBe(sampleCount);
      expect(plan.sections.at(-1)!.sourceEndSample).toBe(sampleCount);
      expect(plan.totalFrames / 24 - sampleCount / sampleRate).toBeGreaterThanOrEqual(0);
      expect(plan.totalFrames / 24 - sampleCount / sampleRate).toBeLessThan(1 / 24 + 1e-10);
    }
  });
  it("rejects fabricated/out-of-source quiet regions and incompatible clocks", () => {
    expect(() => planShortSpeaking({ sampleRate: 24000, sampleCount: 72000, fps: 25 })).toThrow("24 fps");
    expect(() => planShortSpeaking({ sampleRate: 24000, sampleCount: 72000, quiet: [{ startSample: -1, endSample: 2000 }] })).toThrow("measured");
    expect(() => planShortSpeaking({ sampleRate: 24000, sampleCount: 0 })).toThrow("valid original samples");
  });
  it("uses an extra container when that avoids a join during continuous speech", () => {
    // Mark 6:4 source pattern: three balanced sections miss the quiet at 4.1s.
    const sampleRate = 24000, sampleCount = 215760;
    const quiet = [[.886, .993], [1.899, 2.025], [3.036, 3.196], [4.057, 4.167], [7.184, 7.304], [8.893, 8.99]]
      .map(([s, e]) => ({ startSample: Math.round(s! * sampleRate), endSample: Math.round(e! * sampleRate) }));
    const plan = planShortSpeaking({ sampleRate, sampleCount, quiet });
    expect(plan.sections).toHaveLength(4);
    for (const [i, section] of plan.sections.entries()) {
      expect(section.sourceStartSample).toBe(i ? plan.sections[i - 1]!.sourceEndSample : 0);
      expect(section.sourceEndSample - section.sourceStartSample).toBeLessThanOrEqual(4 * sampleRate);
      expect(section.retainedFrames).toBeLessThanOrEqual(96);
      if (i < plan.sections.length - 1) {
        expect(quiet.some(q => q.startSample <= section.sourceEndSample && section.sourceEndSample <= q.endSample)).toBe(true);
      }
    }
    expect(plan.sections.at(-1)!.sourceEndSample).toBe(sampleCount);
    expect(plan.assemblyAudio).toBe("one_continuous_original_full_line");
  });
  it("keeps the review finding when a long speech run has no quiet-only route", () => {
    const plan = planShortSpeaking({ sampleRate: 24000, sampleCount: 24000 * 10,
      quiet: [{ startSample: 24000, endSample: 26000 }, { startSample: 190000, endSample: 192000 }] });
    expect(plan.sections.some(s => s.boundaryReason.includes("no measured quiet"))).toBe(true);
    expect(plan.sections.reduce((n, s) => n + s.sourceEndSample - s.sourceStartSample, 0)).toBe(240000);
  });
});
