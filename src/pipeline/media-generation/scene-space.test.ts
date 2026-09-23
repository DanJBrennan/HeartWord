import { describe, expect, it } from "vitest";
import { buildShotPrompt, expandTzitzitDefinition, findLockedCanonConflicts } from "./index.js";

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

  it("automatically applies the historical doorway construction rule", () => {
    const prompt = buildShotPrompt(
      { id: "scene", sequence: 1, lighting_continuity: null, spatial_continuity: null },
      { id: "shot", scene_id: "scene", sequence: 1, action: "Scribes leave through the doorway.", framing: null, camera_movement: null, needs_lip_sync: 0, crowd_density: null, continuity_notes: null, spatial_view: null, verse_ref: "Mark 3:6" },
      []
    );
    expect(prompt).toContain("DOORWAYS: whenever a door is visible");
    expect(prompt).toContain("wooden pivot pegs");
    expect(prompt).toContain("never modern butt hinges");
  });

  it("automatically constrains background wardrobe to the shared historical palette", () => {
    const prompt = buildShotPrompt(
      { id: "scene", sequence: 1, lighting_continuity: null, spatial_continuity: null },
      { id: "shot", scene_id: "scene", sequence: 1, action: "A crowd gathers.", framing: null, camera_movement: null, needs_lip_sync: 0, crowd_density: "packed", continuity_notes: null, spatial_view: null, verse_ref: "Mark 3:7" },
      []
    );
    expect(prompt).toContain("COSTUME PALETTE");
    expect(prompt).toContain("high-contrast green-and-white vertical stripes");
    expect(prompt).toContain("approved canon");
  });

  it("defaults every generated frame to readable ambient light", () => {
    const prompt = buildShotPrompt(
      { id: "scene", sequence: 1, lighting_continuity: "dusty interior daylight", spatial_continuity: null },
      { id: "shot", scene_id: "scene", sequence: 1, action: "A crowd listens.", framing: null, camera_movement: null, needs_lip_sync: 0, crowd_density: "packed", continuity_notes: null, spatial_view: null, verse_ref: "Mark 3:20" },
      []
    );
    expect(prompt).toContain("LIGHTING READABILITY");
    expect(prompt).toContain("generous motivated ambient light");
    expect(prompt).toContain("stated story purpose specifically calls for it");
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

describe("tzitzit prompt expansion", () => {
  it("turns a compact historical term into an unambiguous visual instruction", () => {
    const prompt = expandTzitzitDefinition("The principal scribe wears tzitzit.");
    expect(prompt).toContain("TZITZIT COSTUME RULE");
    expect(prompt).toContain("short, hand-twisted wool cords");
    expect(prompt).toContain("never a continuous border, long white hanging fringe");
  });

  it("treats tassel wording as an alias for tzitzit rather than decorative trim", () => {
    const prompt = expandTzitzitDefinition("The scribe's tassels must be corrected.");
    expect(prompt).toContain("TZITZIT COSTUME RULE");
    expect(prompt).toContain("never a continuous border, long white hanging fringe");
  });

  it("does not add costume rules when tzitzit are not requested", () => {
    expect(expandTzitzitDefinition("A plain undyed mantle.")).not.toContain("TZITZIT COSTUME RULE");
  });
});
