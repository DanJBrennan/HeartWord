import { describe, expect, it } from "vitest";
import { editorialAlignmentDisplay } from "./source-alignment-editorial-classifications.js";

describe("human-reviewed editorial source alignment", () => {
  it("labels a title and citations without assigning it to Scripture", () => {
    expect(editorialAlignmentDisplay("narrated_title_cross_reference")).toBe("Human-reviewed narrated title/cross-reference — film treatment held for review");
  });

  it("keeps a combined Scripture/editorial transition held for review instead of inventing a boundary", () => {
    expect(editorialAlignmentDisplay("mixed_editorial_transition")).toBe("Human-reviewed title/cross-reference transition — film treatment held for review");
  });

  it("reflects a producer's resolved film treatment once recorded", () => {
    expect(editorialAlignmentDisplay("narrated_title_cross_reference", "title_card")).toBe("Human-reviewed narrated title/cross-reference — resolved: on-screen title card");
    expect(editorialAlignmentDisplay("mixed_editorial_transition", "omit")).toBe("Human-reviewed title/cross-reference transition — resolved: omitted from film, evidence retained");
    expect(editorialAlignmentDisplay("narrated_title_cross_reference", "narrated")).toBe("Human-reviewed narrated title/cross-reference — resolved: included as narrated film content");
    expect(editorialAlignmentDisplay("narrated_title_cross_reference", null)).toBe("Human-reviewed narrated title/cross-reference — film treatment held for review");
  });
});
