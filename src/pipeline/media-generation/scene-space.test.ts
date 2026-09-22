import { describe, expect, it } from "vitest";
import { buildShotPrompt, findLockedCanonConflicts } from "./index.js";

describe("shared scene-space prompt", () => {
  it("keeps a later angle tied to the same planned room", () => {
    const prompt = buildShotPrompt(
      { id: "scene", sequence: 1, lighting_continuity: "daylight through high openings", spatial_continuity: "Large synagogue interior; rear entrance, wall benches, and central floor remain fixed." },
      { id: "shot", scene_id: "scene", sequence: 3, action: "Jesus calls the man forward.", framing: "medium_close", camera_movement: "static", needs_lip_sync: 1, crowd_density: "moderate", continuity_notes: null, spatial_view: "Chest-up from the central floor; the room is intentionally mostly out of frame and must not read as smaller.", verse_ref: "Mark 3:3" },
      ["Jesus"]
    );
    expect(prompt).toContain("Large synagogue interior");
    expect(prompt).toContain("must not read as smaller");
  });
});

describe("locked character canon", () => {
  const jesusCanon = [{
    name: "Jesus",
    facts: {
      description: "cream mantle with indigo vertical bands and corner detail; modest hand-knotted corner fringes, never a predominantly blue mantle.",
      prohibitedPromptPhrases: ["blue mantle", "predominantly blue mantle", "tasseled blue mantle"]
    }
  }];

  it("adds approved wardrobe facts to every character prompt", () => {
    const prompt = buildShotPrompt(
      { id: "scene", sequence: 1, lighting_continuity: null, spatial_continuity: null },
      { id: "shot", scene_id: "scene", sequence: 1, action: "Jesus teaches.", framing: null, camera_movement: null, needs_lip_sync: 1, crowd_density: null, continuity_notes: null, spatial_view: null, verse_ref: "Mark 3:4" },
      ["Jesus"], null, jesusCanon
    );
    expect(prompt).toContain("LOCKED CHARACTER CANON");
    expect(prompt).toContain("cream mantle with indigo vertical bands");
  });

  it("blocks a contradictory producer instruction before generation", () => {
    expect(findLockedCanonConflicts("Jesus wears a muted blue mantle.", jesusCanon)).toEqual([
      "Jesus: instruction conflicts with locked canon phrase “blue mantle”"
    ]);
  });
});
