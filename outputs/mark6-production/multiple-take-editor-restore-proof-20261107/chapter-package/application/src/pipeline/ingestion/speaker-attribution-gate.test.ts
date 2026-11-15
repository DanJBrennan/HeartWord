import { describe, expect, it } from "vitest";
import { directSpeechRuns, directSpeechVerseNumbers, incompleteSpeakerAttributionHold, missingSpeakerAttributionHold } from "./speaker-attribution-gate.js";

describe("speaker attribution gate", () => {
  const verses = [
    { verse: 1, text: "The crowd gathered by the sea." },
    { verse: 2, text: "He said, “Listen!”" },
    { verse: 3, text: "Then he asked, ‘Do you understand?’" }
  ];

  it("identifies direct-speech verses without naming a speaker", () => {
    expect(directSpeechVerseNumbers(verses)).toEqual([2, 3]);
  });

  it("holds before casting when quoted Scripture has no attributed source segment", () => {
    expect(missingSpeakerAttributionHold(verses, 0)).toContain("Casting held before storyboard generation");
  });

  it("allows narration-only text and chapters with recorded attributions", () => {
    expect(missingSpeakerAttributionHold([{ verse: 1, text: "The crowd gathered." }], 0)).toBeNull();
    expect(missingSpeakerAttributionHold(verses, 1)).toBeNull();
  });

  it("accepts an explicitly reviewed narrated thought without inventing a character voice",()=>{
    const text=[{verse:28,text:'She thought, “If I touch his clothes.”'}];
    expect(incompleteSpeakerAttributionHold(text,[{verseRef:"Mark 5:28",speakerId:null,reviewedNarration:true}])).toBeNull();
    expect(incompleteSpeakerAttributionHold(text,[{verseRef:"Mark 5:28",speakerId:null}])).toContain("28");
  });
  it("still holds an unreviewed tail after a confirmed narrator passage",()=>{
    const text=[{verse:28,text:'She thought, “If I touch his clothes.”'}];
    expect(incompleteSpeakerAttributionHold(text,[{verseRef:"Mark 5:28",speakerId:null,reviewedNarration:true,startMs:0,endMs:1000},{verseRef:"Mark 5:28",speakerId:null,startMs:1000,endMs:2000}])).toContain("28");
  });

  it("keeps a multi-verse direct-speech run from passing on one attributed fragment", () => {
    const parable = [
      { verse: 3, text: "He said, “Listen! A sower went out to sow.”" },
      { verse: 4, text: "As he sowed, some seed fell along the path." },
      { verse: 5, text: "Other seed fell on rocky ground." },
      { verse: 6, text: "And when the sun rose, it was scorched." },
      { verse: 7, text: "Other seed fell among thorns." },
      { verse: 8, text: "Other seed fell into good soil." },
      { verse: 9, text: "And he said, “He who has ears to hear, let him hear.”" }
    ];
    expect(directSpeechRuns(parable)).toEqual([[3], [9]]);
    // Reference punctuation can place the quotation markers only at the
    // speaker's opening and closing phrases; the gate must still flag the
    // unbound interior source verses supplied by review metadata.
    const spanReference = parable.map((verse, index) => index === 0 ? { ...verse, text: "He said, “Listen! A sower went out to sow." } :
      index === parable.length - 1 ? { ...verse, text: "He who has ears to hear, let him hear.”" } : verse);
    expect(directSpeechRuns(spanReference)).toEqual([[3, 4, 5, 6, 7, 8, 9]]);
    const source = spanReference.map(verse => ({ verseRef: `Mark 4:${verse.verse}`, speakerId: verse.verse === 3 || verse.verse === 9 ? "jesus" : null }));
    expect(incompleteSpeakerAttributionHold(spanReference, source)).toContain("4, 5, 6, 7, 8");
    expect(incompleteSpeakerAttributionHold(spanReference, source.map(segment => ({ ...segment, speakerId: "jesus" })))).toBeNull();
  });

  it("holds an unassigned source slice after speech begins even when its verse has another binding", () => {
    const reference = [
      { verse: 3, text: "He said, “Listen carefully." },
      { verse: 4, text: "The sower went out to sow.”" }
    ];
    const segments = [
      { verseRef: "Mark 4:3", speakerId: null, startMs: 0, endMs: 150 }, // narrated lead-in
      { verseRef: "Mark 4:3", speakerId: "jesus", startMs: 150, endMs: 1000 },
      { verseRef: null, speakerId: null, startMs: 1000, endMs: 1200 }, // alignment leftover
      { verseRef: "Mark 4:4", speakerId: "jesus", startMs: 1200, endMs: 2000 }
    ];
    expect(incompleteSpeakerAttributionHold(reference, segments)).toContain("3, 4");
    expect(incompleteSpeakerAttributionHold(reference, segments.map(segment =>
      segment.startMs === 1000 ? { ...segment, speakerId: "jesus" } : segment
    ))).toBeNull();
  });
});
