import { describe, expect, it } from "vitest";
import { checkAspectRatio, cropKeyframe, MAX_ASPECT_RATIO_DEVIATION, TARGET_ASPECT_RATIO } from "./crop-keyframe.js";

describe("checkAspectRatio", () => {
  it("accepts an exact 16:9 box", () => {
    const result = checkAspectRatio({ width: 1280, height: 720 });
    expect(result.ok).toBe(true);
    expect(result.aspectRatio).toBeCloseTo(TARGET_ASPECT_RATIO, 5);
  });

  it("accepts the real crop boxes used for Scene 1 Shot 7's fix", () => {
    expect(checkAspectRatio({ width: 780, height: 439 }).ok).toBe(true);
    expect(checkAspectRatio({ width: 800, height: 450 }).ok).toBe(true);
  });

  it("rejects the two real boxes that caused Kling to return the wrong aspect ratio", () => {
    // 480x700 (0.686:1) and 850x750 (1.133:1) -- both confirmed empirically
    // 2026-09-09 to come back from Kling in that same wrong ratio.
    expect(checkAspectRatio({ width: 480, height: 700 }).ok).toBe(false);
    expect(checkAspectRatio({ width: 850, height: 750 }).ok).toBe(false);
  });

  it("is right at the edge of tolerance just inside and just outside the boundary", () => {
    const maxRatio = TARGET_ASPECT_RATIO * (1 + MAX_ASPECT_RATIO_DEVIATION);
    const minRatio = TARGET_ASPECT_RATIO * (1 - MAX_ASPECT_RATIO_DEVIATION);
    expect(checkAspectRatio({ width: maxRatio * 1000 - 1, height: 1000 }).ok).toBe(true);
    expect(checkAspectRatio({ width: maxRatio * 1000 + 50, height: 1000 }).ok).toBe(false);
    expect(checkAspectRatio({ width: minRatio * 1000 + 1, height: 1000 }).ok).toBe(true);
    expect(checkAspectRatio({ width: minRatio * 1000 - 50, height: 1000 }).ok).toBe(false);
  });
});

describe("cropKeyframe", () => {
  it("throws before touching the filesystem or shelling out when the box isn't 16:9-ish", () => {
    expect(() => cropKeyframe("/nonexistent/source.png", { x: 0, y: 0, width: 480, height: 700 }, "/nonexistent/out.png")).toThrow(
      /too far from 16:9/
    );
  });
});
