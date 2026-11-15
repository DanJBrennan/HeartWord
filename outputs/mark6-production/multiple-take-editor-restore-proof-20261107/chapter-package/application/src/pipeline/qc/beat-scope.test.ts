import { describe, expect, it } from "vitest";
import { matchesBeatScope, stripBeatTag, tagNote } from "./beat-scope.js";

describe("matchesBeatScope", () => {
  it("applies an untagged (shot-wide) note to every beat", () => {
    const note = "The producer accepts this keyframe -- the missing debris is fine, people obscure the floor.";
    expect(matchesBeatScope(note, { beatId: "beat-1" })).toBe(true);
    expect(matchesBeatScope(note, { beatId: "beat-2" })).toBe(true);
    expect(matchesBeatScope(note, {})).toBe(true);
  });

  it("applies a beat-tagged (standing) note to any candidate of its own beat, not a sibling beat", () => {
    const note = "BEAT: beat-1\nAn obscured floor here is fine, people are standing on it.";
    expect(matchesBeatScope(note, { beatId: "beat-1" })).toBe(true);
    expect(matchesBeatScope(note, { beatId: "beat-1", attemptId: "candidate-99" })).toBe(true);
    // The exact regression Dan reported: an exception for one beat's
    // obscured floor must not excuse a different beat's clearly visible
    // empty floor.
    expect(matchesBeatScope(note, { beatId: "beat-2" })).toBe(false);
  });

  it("excludes a beat-tagged note from a single-clip (no beatId) lookup", () => {
    const note = "BEAT: beat-1\nSome beat-specific exception.";
    expect(matchesBeatScope(note, {})).toBe(false);
  });

  it("scopes a beat+attempt-tagged note to that one candidate only, not a sibling candidate of the same beat", () => {
    const note = "BEAT: beat-1\nATTEMPT: candidate-1\nThis exact candidate's obscured floor is fine.";
    expect(matchesBeatScope(note, { beatId: "beat-1", attemptId: "candidate-1" })).toBe(true);
    // The regression Codex's second pass reported: a regenerated
    // candidate can have a totally different composition, so an
    // exception about one candidate is not evidence about another.
    expect(matchesBeatScope(note, { beatId: "beat-1", attemptId: "candidate-2" })).toBe(false);
    expect(matchesBeatScope(note, { beatId: "beat-1" })).toBe(false);
  });

  it("scopes an attempt-only-tagged note (single-clip 'review incomplete' marker) to that exact attempt", () => {
    const note = "ATTEMPT: attempt-1\nREVIEW STATUS: incomplete\nsome error";
    expect(matchesBeatScope(note, { attemptId: "attempt-1" })).toBe(true);
    // A coverage-beat shot's newer, unrelated note must not mask this.
    expect(matchesBeatScope(note, { attemptId: "attempt-2" })).toBe(false);
    expect(matchesBeatScope(note, { beatId: "some-beat", attemptId: "attempt-1" })).toBe(true);
  });
});

describe("stripBeatTag", () => {
  it("removes leading BEAT/ATTEMPT tag lines before the text reaches a prompt", () => {
    expect(stripBeatTag("BEAT: beat-1\nThe actual override text.")).toBe("The actual override text.");
    expect(stripBeatTag("BEAT: beat-1\nATTEMPT: candidate-1\nThe actual override text.")).toBe("The actual override text.");
    expect(stripBeatTag("ATTEMPT: attempt-1\nThe actual text.")).toBe("The actual text.");
  });

  it("leaves an untagged note unchanged", () => {
    expect(stripBeatTag("The actual override text.")).toBe("The actual override text.");
  });
});

describe("tagNote", () => {
  it("prepends only the tags actually set, in BEAT-then-ATTEMPT order", () => {
    expect(tagNote({ beatId: "beat-1" }, "text")).toBe("BEAT: beat-1\ntext");
    expect(tagNote({ attemptId: "attempt-1" }, "text")).toBe("ATTEMPT: attempt-1\ntext");
    expect(tagNote({ beatId: "beat-1", attemptId: "attempt-1" }, "text")).toBe("BEAT: beat-1\nATTEMPT: attempt-1\ntext");
    expect(tagNote({}, "text")).toBe("text");
  });

  it("round-trips through matchesBeatScope/stripBeatTag", () => {
    const scope = { beatId: "beat-1", attemptId: "attempt-1" };
    const tagged = tagNote(scope, "the override text");
    expect(matchesBeatScope(tagged, scope)).toBe(true);
    expect(stripBeatTag(tagged)).toBe("the override text");
  });
});
