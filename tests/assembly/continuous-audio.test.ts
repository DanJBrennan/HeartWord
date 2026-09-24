import { expect, it } from "vitest";
import { continuousAudioGroups } from "../../src/pipeline/assembly/continuous-audio.js";

it("keeps a continuing speaker from one source file on a single audio extraction", () => {
  expect(continuousAudioGroups([
    { segmentId: "a", path: "chapter.wav", speakerId: null, sourceStartMs: 0, sourceEndMs: 1000, startMs: 0, endMs: 1000 },
    { segmentId: "b", path: "chapter.wav", speakerId: null, sourceStartMs: 1000, sourceEndMs: 2000, startMs: 1000, endMs: 2000 }
  ])).toEqual([{ segmentIds: ["a", "b"], path: "chapter.wav", speakerId: null,
    sourceStartMs: 0, sourceEndMs: 2000, startMs: 0, endMs: 2000 }]);
});

it("does not merge across a pause, changed source file, or speaker turn", () => {
  const groups = continuousAudioGroups([
    { segmentId: "a", path: "chapter.wav", speakerId: null, sourceStartMs: 0, sourceEndMs: 1000, startMs: 0, endMs: 1000 },
    { segmentId: "b", path: "chapter.wav", speakerId: null, sourceStartMs: 1000, sourceEndMs: 2000, startMs: 1200, endMs: 2200 },
    { segmentId: "c", path: "cast.wav", speakerId: "jesus", sourceStartMs: 0, sourceEndMs: 500, startMs: 2200, endMs: 2700 },
    { segmentId: "d", path: "cast.wav", speakerId: "narrator", sourceStartMs: 500, sourceEndMs: 1000, startMs: 2700, endMs: 3200 }
  ]);
  expect(groups.map(group => group.segmentIds)).toEqual([["a"], ["b"], ["c"], ["d"]]);
});
