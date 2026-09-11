import { describe, expect, it } from "vitest";
import { matchesBeatScope, stripBeatTag } from "./beat-scope.js";

describe("matchesBeatScope", () => {
  it("applies an untagged (shot-wide) note to every beat", () => {
    const note = "The producer accepts this keyframe -- the missing debris is fine, people obscure the floor.";
    expect(matchesBeatScope(note, "beat-1")).toBe(true);
    expect(matchesBeatScope(note, "beat-2")).toBe(true);
    expect(matchesBeatScope(note, undefined)).toBe(true);
  });

  it("applies a beat-tagged note only to its own beat, not a sibling beat", () => {
    const note = "BEAT: beat-1\nAn obscured floor here is fine, people are standing on it.";
    expect(matchesBeatScope(note, "beat-1")).toBe(true);
    // The exact regression Dan reported: an exception for one beat's
    // obscured floor must not excuse a different beat's clearly visible
    // empty floor.
    expect(matchesBeatScope(note, "beat-2")).toBe(false);
  });

  it("excludes a beat-tagged note from a single-clip (no beatId) lookup", () => {
    const note = "BEAT: beat-1\nSome beat-specific exception.";
    expect(matchesBeatScope(note, undefined)).toBe(false);
  });
});

describe("stripBeatTag", () => {
  it("removes a leading BEAT tag line before the text reaches a prompt", () => {
    expect(stripBeatTag("BEAT: beat-1\nThe actual override text.")).toBe("The actual override text.");
  });

  it("leaves an untagged note unchanged", () => {
    expect(stripBeatTag("The actual override text.")).toBe("The actual override text.");
  });
});
