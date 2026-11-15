import { expect, it } from "vitest";
import { sceneReferenceAssetsForVerse } from "./story-state-assets.js";

const assets = [
  { category: "body_pose", path: "pre.png", story_state: "pre_healing", available_through_verse: "Mark 3:4", asset_role: "base_pose" },
  { category: "body_pose", path: "healed.png", story_state: "healed", available_from_verse: "Mark 3:5", asset_role: "story_state_pose" },
  { category: "state_proof", path: "proof.png", story_state: "healed", available_from_verse: "Mark 3:5", asset_role: "comparison_proof" }
];

it("keeps healing-state assets in their canonical story range and never selects proof images", () => {
  expect(sceneReferenceAssetsForVerse(assets, "Mark 3:4").map(asset => asset.path)).toEqual(["pre.png"]);
  expect(sceneReferenceAssetsForVerse(assets, "Mark 3:5").map(asset => asset.path)).toEqual(["healed.png"]);
  expect(sceneReferenceAssetsForVerse(assets).map(asset => asset.path)).toEqual([]);
});
