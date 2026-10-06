import { expect, it } from "vitest";
import { assertSpeakerAudioContinuity, continuousAudioGroups } from "../../src/pipeline/assembly/continuous-audio.js";

it("keeps a continuing speaker from one source file on a single audio extraction", () => {
  expect(continuousAudioGroups([
    { segmentId: "a", path: "chapter.wav", speakerId: null, voice: "original", sourceStartMs: 0, sourceEndMs: 1000, startMs: 0, endMs: 1000 },
    { segmentId: "b", path: "chapter.wav", speakerId: null, voice: "original", sourceStartMs: 1000, sourceEndMs: 2000, startMs: 1000, endMs: 2000 }
  ])).toEqual([{ segmentIds: ["a", "b"], path: "chapter.wav", speakerId: null, voice: "original",
    sourceStartMs: 0, sourceEndMs: 2000, startMs: 0, endMs: 2000 }]);
});

it("does not merge across a pause, changed source file, or speaker turn", () => {
  const groups = continuousAudioGroups([
    { segmentId: "a", path: "chapter.wav", speakerId: null, voice: "original", sourceStartMs: 0, sourceEndMs: 1000, startMs: 0, endMs: 1000 },
    { segmentId: "b", path: "chapter.wav", speakerId: null, voice: "original", sourceStartMs: 1000, sourceEndMs: 2000, startMs: 1200, endMs: 2200 },
    { segmentId: "c", path: "cast.wav", speakerId: "jesus", voice: "cast", sourceStartMs: 0, sourceEndMs: 500, startMs: 2200, endMs: 2700 },
    { segmentId: "d", path: "cast.wav", speakerId: "narrator", voice: "cast", sourceStartMs: 500, sourceEndMs: 1000, startMs: 2700, endMs: 3200 }
  ]);
  expect(groups.map(group => group.segmentIds)).toEqual([["a"], ["b"], ["c"], ["d"]]);
});

it("blocks narrator leakage through a covered speaker interval before render", () => {
  const source = [
    { id: "narration", startMs: 0, endMs: 1000, speakerId: null },
    { id: "jesus-line", startMs: 1000, endMs: 3000, speakerId: "jesus" }
  ];
  const coveredLine = [
    { segmentId: "narration", path: "source.wav", speakerId: null, voice: "original" as const, sourceStartMs: 0, sourceEndMs: 1000, startMs: 0, endMs: 1000 },
    // The image could be a listener or wide master; the audio must remain cast.
    { segmentId: "jesus-line", path: "cast.wav", speakerId: "jesus", voice: "cast" as const, sourceStartMs: 0, sourceEndMs: 2000, startMs: 1000, endMs: 3000 }
  ];
  expect(() => assertSpeakerAudioContinuity(source, coveredLine)).not.toThrow();
  expect(() => assertSpeakerAudioContinuity(source, [{ ...coveredLine[0] }, { ...coveredLine[1], path: "source.wav", voice: "original" }]))
    .toThrow(/independent of picture coverage/);
});
