import { describe, expect, it } from "vitest";
import { hasJoinedByScene, parseBookChapterVerse } from "./disciple-timeline.js";

describe("parseBookChapterVerse", () => {
  it("parses a single verse reference", () => {
    expect(parseBookChapterVerse("Mark 1:16")).toEqual({ book: "mark", chapter: 1, verse: 16 });
  });

  it("uses the start of a verse range", () => {
    expect(parseBookChapterVerse("Mark 1:16-18")).toEqual({ book: "mark", chapter: 1, verse: 16 });
  });

  it("lowercases the book name for case-insensitive comparison", () => {
    expect(parseBookChapterVerse("MARK 3:13").book).toBe("mark");
  });

  it("throws on an unparseable reference", () => {
    expect(() => parseBookChapterVerse("not a reference")).toThrow();
  });
});

describe("hasJoinedByScene", () => {
  it("is always available when joinedNarrativeAt is null/undefined (not gated)", () => {
    expect(hasJoinedByScene(null, "Mark 2:1")).toBe(true);
    expect(hasJoinedByScene(undefined, "Mark 2:1")).toBe(true);
  });

  it("is available once the scene reaches the same chapter and verse", () => {
    expect(hasJoinedByScene("Mark 2:14", "Mark 2:14")).toBe(true);
  });

  it("is available for a later verse in the same chapter", () => {
    expect(hasJoinedByScene("Mark 2:14", "Mark 2:18")).toBe(true);
  });

  it("is NOT available for an earlier verse in the same chapter", () => {
    expect(hasJoinedByScene("Mark 2:14", "Mark 2:1")).toBe(false);
  });

  it("is available for any later chapter regardless of verse number", () => {
    // Matthew joins at Mark 2:14; a later chapter's early verse (e.g.
    // Mark 3:1) is still after Mark 2:14 even though 1 < 14 numerically.
    expect(hasJoinedByScene("Mark 2:14", "Mark 3:1")).toBe(true);
  });

  it("is NOT available for an earlier chapter regardless of verse number", () => {
    expect(hasJoinedByScene("Mark 2:14", "Mark 1:40")).toBe(false);
  });

  it("matches the real Matthew/Mark-2 case this was built for", () => {
    // Matthew is called at Mark 2:14 -- must be absent from scene 1
    // (Mark 2:1-12, the healing of the paralytic, before he's called)
    // and present from scene 2 onward (Mark 2:13-17, his own calling
    // scene, through the rest of the chapter).
    expect(hasJoinedByScene("Mark 2:14", "Mark 2:1")).toBe(false);
    expect(hasJoinedByScene("Mark 2:14", "Mark 2:13")).toBe(false);
    expect(hasJoinedByScene("Mark 2:14", "Mark 2:23")).toBe(true);
  });

  it("defaults to available when either reference can't be parsed", () => {
    expect(hasJoinedByScene("Mark 2:14", "not a reference")).toBe(true);
    expect(hasJoinedByScene("not a reference either", "Mark 2:1")).toBe(true);
  });

  it("defaults to available when the books differ (cross-book ordering not supported)", () => {
    expect(hasJoinedByScene("Mark 2:14", "Matthew 9:9")).toBe(true);
  });
});
