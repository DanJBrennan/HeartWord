import { expect, it } from "vitest";
import { classifyFlashContinuity, detectRapidVisualCutFlashes, detectTimelineFlashes } from "./flash-detection.js";

it("flags placements of five frames or fewer at the encoded frame boundary", () => {
  expect(detectTimelineFlashes([
    { shotId: "normal", startMs: 0, endMs: 250 },
    { shotId: "flash", startMs: 250, endMs: 250 + 5 * 1000 / 24 }
  ])).toMatchObject([{ label: "flash", startFrame: 6, endFrameExclusive: 11, frameCount: 5 }]);
});

it("does not flag six-frame coverage", () => {
  expect(detectTimelineFlashes([{ shotId: "six frames", startMs: 0, endMs: 6 * 1000 / 24 }])).toEqual([]);
});

it("finds a rapid visual interval between two post-render scene cuts", () => {
  expect(detectRapidVisualCutFlashes([1000, 1000 + 4 * 1000 / 24, 3000])).toMatchObject([{ frameCount: 4, startFrame: 24, endFrameExclusive: 28 }]);
});

it("keeps a short tail or head that visibly continues one adjacent shot", () => {
  expect(classifyFlashContinuity(0.93, 0.2)).toBe("continuous_with_preceding");
  expect(classifyFlashContinuity(0.2, 0.93)).toBe("continuous_with_following");
  expect(classifyFlashContinuity(0.51, 0.2)).toBe("continuous_with_preceding");
  expect(classifyFlashContinuity(0.2, 0.3)).toBe("discontinuous");
});
