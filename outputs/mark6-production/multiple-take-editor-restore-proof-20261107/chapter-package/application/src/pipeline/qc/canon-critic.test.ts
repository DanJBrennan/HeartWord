import { describe, expect, it } from "vitest";
import { criticSampledAssets } from "./canon-critic.js";

const exists = () => true;

describe("criticSampledAssets", () => {
  it("prefers a freshly promoted asset over one carried forward, within the same category", () => {
    // The real bug (found 2026-09-21 re-auditing "Man with Withered Hand"):
    // path order alone sampled two untouched healing-state poses ahead of
    // the actually-corrected neutral-standing pose, so the audit judged a
    // real fix by images that never contained it.
    const assets = [
      { category: "body_pose", path: "characters/x/motion/motion-hand-stretched-healed-v1.png", importedFrom: "Carried forward unchanged from prior approved version" },
      { category: "body_pose", path: "characters/x/motion/motion-hand-stretched-pre-healing-v1.png", importedFrom: "Carried forward unchanged from prior approved version" },
      { category: "body_pose", path: "characters/x/motion/motion-neutral-standing-v2.png", importedFrom: "Dan-approved generated candidate, 2026-09-21" },
      { category: "body_pose", path: "characters/x/motion/motion-seated-listening-v1.png", importedFrom: "Carried forward unchanged from prior approved version" }
    ];
    const sampled = criticSampledAssets(assets, exists);
    expect(sampled.map(a => a.path)).toContain("characters/x/motion/motion-neutral-standing-v2.png");
  });

  it("still ranks category first: a carried-forward body_pose beats a fresh turnaround", () => {
    const assets = [
      { category: "turnaround", path: "characters/x/turnaround/fresh.png", importedFrom: "Dan-approved generated candidate, 2026-09-21" },
      { category: "body_pose", path: "characters/x/motion/stale.png", importedFrom: "Carried forward unchanged" }
    ];
    const sampled = criticSampledAssets(assets, exists);
    expect(sampled[0]?.path).toBe("characters/x/motion/stale.png");
  });

  it("falls back to path order when nothing distinguishes freshness", () => {
    const assets = [
      { category: "body_pose", path: "b.png", importedFrom: null },
      { category: "body_pose", path: "a.png", importedFrom: null }
    ];
    const sampled = criticSampledAssets(assets, exists);
    expect(sampled.map(a => a.path)).toEqual(["a.png", "b.png"]);
  });

  it("treats a missing importedFrom the same as one that isn't carried-forward text", () => {
    const assets = [
      { category: "body_pose", path: "no-marker.png" },
      { category: "body_pose", path: "stale.png", importedFrom: "Carried forward unchanged" }
    ];
    const sampled = criticSampledAssets(assets, exists);
    expect(sampled[0]?.path).toBe("no-marker.png");
  });
});
