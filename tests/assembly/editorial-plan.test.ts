import { describe, expect, it } from "vitest";
import { planEditorialCut, validateSourcePlacements } from "../../src/pipeline/assembly/editorial-plan.js";
import type { CrewBrief, CrewContribution } from "../../src/pipeline/creative-direction/crew-types.js";

function brief(): CrewBrief {
  return { project: { id: "p", language: "hatam", book: "mark", chapter: 2 }, source: { text: [], reference: [], hashes: [] },
    audio: [{ id: "n", startMs: 0, endMs: 4000, path: "n.wav", speakerId: null, verseRef: "Mark 2:1", confidence: 99 },
      { id: "d", startMs: 4000, endMs: 8000, path: "n.wav", speakerId: "c", verseRef: "Mark 2:2", confidence: 99 }],
    shots: [false, true].map((needsLipSync, i) => ({ id: `s${i}`, sceneId: "scene", sceneSequence: 1, sequence: i + 1,
      verseRef: `Mark 2:${i + 1}`, action: "Action", framing: "close_up", cameraMovement: "static", continuity: null, lighting: null,
      needsLipSync, characterIds: ["c"], dialogueCharacterId: needsLipSync ? "c" : null, beats: [], clip: { id: `v${i}`, path: `v${i}.mp4`, durationMs: 4000 } })),
    canon: [], producerNotes: [], spentUsd: 0, audioAssets: [], render: null };
}
const editor = (): CrewContribution => ({ summary: "Cut", directions: [], findings: [], coverageRequests: [],
  edits: [{ shotId: "s0", sourceStartMs: 0, durationMs: 4000 }, { shotId: "s1", sourceStartMs: 0, durationMs: 4000 }], pauses: [] });
describe("Picture Editor and protected performance", () => {
  it("uses distinct accepted takes from one shot without changing protected speech",()=>{
    const b=brief(),e=editor();b.shots[0]!.availableClips=[{id:"older",path:"older.mp4",durationMs:2000}];
    e.edits=[{shotId:"s0",clipId:"older",sourceStartMs:0,durationMs:2000},{shotId:"s0",clipId:"v0",sourceStartMs:0,durationMs:2000},e.edits![1]!];
    const cut=planEditorialCut(b,e);
    expect(cut.timeline.slice(0,2).map(t=>[t.clipId,t.path,t.startMs,t.endMs])).toEqual([["older","older.mp4",0,2000],["v0","v0.mp4",2000,4000]]);
    expect(cut.audioMap).toEqual(planEditorialCut(brief(),editor()).audioMap);
  });
  it.each(["unknown","v1","",null,123])("rejects an unavailable or wrong-shot explicit take %s",clipId=>{
    const e=editor();(e.edits![0] as any).clipId=clipId;
    expect(()=>planEditorialCut(brief(),e)).toThrow(/unavailable footage/);
  });
  it("checks the chosen alternative's actual duration and preserves lip-sync placement",()=>{
    const b=brief(),e=editor();b.shots[0]!.availableClips=[{id:"short",path:"short.mp4",durationMs:500}];e.edits![0]!.clipId="short";
    expect(()=>planEditorialCut(b,e)).toThrow(/beyond its content/);
    e.edits![0]!.clipId="v0";b.shots[1]!.availableClips=[{id:"speech-alt",path:"speech-alt.mp4",durationMs:4000}];e.edits![1]!.clipId="speech-alt";e.edits!.reverse();
    expect(()=>planEditorialCut(b,e)).toThrow(/lip-synced/);
  });
  it("adds an establishing view and emotional breathing room while retaining every source millisecond", () => {
    const b = brief(), e = editor();
    e.pauses = [{ afterSegmentId: null, durationMs: 2000, reason: "Establishing view" }, { afterSegmentId: "n", durationMs: 1000, reason: "Let the reaction breathe" }];
    e.edits = [{ shotId: "s0", sourceStartMs: 0, durationMs: 2000 }, { shotId: "s0", sourceStartMs: 0, durationMs: 4000 },
      { shotId: "s0", sourceStartMs: 0, durationMs: 1000 }, { shotId: "s1", sourceStartMs: 0, durationMs: 4000 }];
    const cut = planEditorialCut(b, e);
    expect(cut.durationMs).toBe(11000);
    expect(cut.audioMap).toEqual([{ segmentId: "n", sourceStartMs: 0, sourceEndMs: 4000, startMs: 2000, endMs: 6000 },
      { segmentId: "d", sourceStartMs: 4000, sourceEndMs: 8000, startMs: 7000, endMs: 11000 }]);
    b.render = { id: "r", path: "cut", sha256: "h", ...cut };
    expect(validateSourcePlacements(b)).toEqual([]);
  });
  it("rejects moving a lip-synced face out of its real spoken interval", () => {
    const e = editor(); e.edits!.reverse();
    expect(() => planEditorialCut(brief(), e)).toThrow("lip-synced");
  });
  it("requests more coverage instead of stretching, truncating or freezing a short clip", () => {
    const e = editor(); e.pauses = [{ afterSegmentId: "d", durationMs: 3000, reason: "Reflection" }];
    expect(() => planEditorialCut(brief(), e)).toThrow("missing coverage");
    e.edits![0]!.durationMs = 6000;
    expect(() => planEditorialCut(brief(), e)).toThrow("beyond its content");
  });
  it("detects missing, duplicated and reordered source performance even when total duration matches", () => {
    const b = brief(), cut = planEditorialCut(b, editor());
    b.render = { id: "r", path: "cut", sha256: "h", ...cut };
    b.render.audioMap!.reverse();
    expect(validateSourcePlacements(b).join(" ")).toContain("original order");
    b.render.audioMap!.pop();
    expect(validateSourcePlacements(b).join(" ")).toContain("omitted or duplicated");
  });
});
