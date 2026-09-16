import { describe, expect, it, vi } from "vitest";
import { proposeReusableLesson, type LessonSynthesisCall } from "./lesson-synthesis.js";

describe("production lesson synthesis", () => {
  it("proposes a reviewable, scoped principle from correction context without activating it", async () => {
    const call = vi.fn<LessonSynthesisCall>(async () => ({
      principle: "For matching Hatam Mark scenes, preserve the approved wardrobe color block when revising coverage.",
      rationale: "The correction identifies wardrobe continuity in the supplied Mark 2 Papuan canon context.",
      scope: "book"
    }));
    const candidate = await proposeReusableLesson({ correction: "Do not change the approved brown robe when adding a reaction shot.", language: "Hatam", book: "Mark", chapter: 2, region: "Papuan", canon: [{ name: "Witness", versionId: "v1" }] }, call);
    expect(candidate.scope).toBe("book");
    expect(candidate.principle).not.toContain("Do not change the approved brown robe when adding a reaction shot.");
    expect(call.mock.calls[0]?.[0]).toContain("Papuan");
  });
  it("rejects a candidate that merely copies the raw correction", async () => {
    await expect(proposeReusableLesson({ correction: "Keep the shot quiet.", language: "Hatam", book: "Mark", chapter: 2, region: "Papuan", canon: [] }, async () => ({ principle: "Keep the shot quiet.", rationale: "same", scope: "chapter" }))).rejects.toThrow("distinct");
  });
});
