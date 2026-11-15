import { describe, expect, it } from "vitest";
import { decodedFrameClock, formatReviewTimecode } from "./public/frame-review-clock.js";

describe("frame review clock", () => {
  it("uses the decoded image timestamp and a zero-based frame index", () => {
    expect(decodedFrameClock(1506 / 24, 24)).toEqual({ frameIndex: 1506, seconds: 1506 / 24, frameRate: 24, indexBase: 0 });
  });

  it("keeps timecode and frame identity on the same frame boundary", () => {
    const clock = decodedFrameClock(1506 / 24, 24);
    expect(formatReviewTimecode(clock.seconds)).toBe("01:02.750");
    expect(clock.frameIndex).toBe(1506);
  });
});
