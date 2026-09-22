import { describe, expect, it } from "vitest";
import { buildShotPrompt } from "./index.js";

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
