import { describe, expect, it } from "vitest";
import { buildScenesFromHeadings, parseVerseRange } from "./build-scenes.js";
import type { SourceHeading } from "../ingestion/parse-source-text.js";

describe("parseVerseRange", () => {
  it("parses a single-verse ref", () => {
    expect(parseVerseRange("Mark 2:5")).toEqual({ start: 5, end: 5 });
  });
  it("parses a multi-verse ref", () => {
    expect(parseVerseRange("Mark 2:8-10")).toEqual({ start: 8, end: 10 });
  });
  it("parses a narration ref with trailing text", () => {
    expect(parseVerseRange("Mark 2:1-5 (narration)")).toEqual({ start: 1, end: 5 });
  });
  it("throws when no verse number is present", () => {
    expect(() => parseVerseRange("no numbers here")).toThrow();
  });
});

describe("buildScenesFromHeadings", () => {
  const headings: SourceHeading[] = [
    { headingText: "Heading A", parallelRefs: "Mat. 1:1", verseStart: 1 },
    { headingText: "Heading B", parallelRefs: null, verseStart: 13 }
  ];

  it("derives scene verse ranges from consecutive heading starts and the chapter's last verse", () => {
    const { scenes } = buildScenesFromHeadings(headings, 28, "mark", 2, []);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toMatchObject({ sequence: 1, verseStart: 1, verseEnd: 12 });
    expect(scenes[1]).toMatchObject({ sequence: 2, verseStart: 13, verseEnd: 28 });
  });

  it("attributes each segment's speaker to the scene its starting verse falls in", () => {
    const segments = [
      { verseRef: "Mark 2:5", speakerName: "Jesus" },
      { verseRef: "Mark 2:14", speakerName: "Jesus" },
      { verseRef: "Mark 2:1-4 (narration)", speakerName: null }
    ];
    const { scenes } = buildScenesFromHeadings(headings, 28, "mark", 2, segments);
    expect(scenes[0]!.summary).toContain("Jesus");
    expect(scenes[1]!.summary).toContain("Jesus");
  });

  it("flags a segment whose verse range crosses a scene boundary instead of silently misassigning it", () => {
    const segments = [{ verseRef: "Mark 2:10-14 (narration)", speakerName: null }];
    const { boundaryStraddlingWarnings } = buildScenesFromHeadings(headings, 28, "mark", 2, segments);
    expect(boundaryStraddlingWarnings).toHaveLength(1);
    expect(boundaryStraddlingWarnings[0]).toContain("spans scene 1 and scene 2");
  });

  it("includes the parallel synoptic reference in the summary when present", () => {
    const { scenes } = buildScenesFromHeadings(headings, 28, "mark", 2, []);
    expect(scenes[0]!.summary).toContain("Mat. 1:1");
    expect(scenes[1]!.summary).not.toContain("parallel");
  });

  it("notes when a scene has no attributed dialogue yet", () => {
    const { scenes } = buildScenesFromHeadings(headings, 28, "mark", 2, []);
    expect(scenes[0]!.summary).toContain("No character dialogue attributed");
  });
});
