import { describe, expect, it } from "vitest";
import { crewSchema } from "../../src/pipeline/creative-direction/crew.js";

describe("live Production Director response schema", () => {
  it("requires the decision fields checked before production approval", () => {
    for (const phase of ["planning", "editing", "finishing"] as const) {
      const required = crewSchema("production_director", phase).required;
      expect(required).toContain("decisionConfidence");
      expect(required).toContain("decisionLimitations");
    }
    expect(crewSchema("production_director").required).not.toContain("decisionConfidence");
  });
});

it("asks finishing sound roles for speech-safe cue gains", () => {
  for (const role of ["sound_designer", "composer"] as const) {
    const schema = crewSchema(role, "finishing") as { properties: Record<string, { items: { properties: Record<string, { maximum?: number }> } }> };
    expect(schema.properties.audioCues.items.properties.gainDb.maximum).toBe(-18);
    expect(schema.properties.generationRequests.items.properties.gainDb.maximum).toBe(-18);
  }
});

it("can close finishing with accepted soundtrack assets only", () => {
  for (const role of ["sound_designer", "composer"] as const) {
    const schema = crewSchema(role, "finishing", false, true, true) as {
      properties: Record<string, { maxItems?: number }>;
    };
    expect(schema.properties.generationRequests.maxItems).toBe(0);
    expect(crewSchema(role, "finishing").properties!.generationRequests).not.toHaveProperty("maxItems");
  }
});

it("keeps the finishing Director verdict free of invented shot directions", () => {
  const schema = crewSchema("production_director", "finishing") as {
    properties: Record<string, { maxItems?: number }>;
  };
  expect(schema.properties.directions.maxItems).toBe(0);
});
