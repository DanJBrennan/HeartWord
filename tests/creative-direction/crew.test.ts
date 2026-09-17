import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runCrew, validateContribution } from "../../src/pipeline/creative-direction/crew.js";
import { crewBriefHash } from "../../src/pipeline/creative-direction/crew-context.js";
import { directionsFromRun, runProductionCrew } from "../../src/pipeline/creative-direction/crew-store.js";
import { finishingRecipe, structuralCutFindings } from "../../src/pipeline/assembly/finishing.js";
import { FINISHING_ROLES, PLANNING_ROLES, type CrewBrief, type CrewContribution, type CrewEvent, type CrewRole, type CrewResult } from "../../src/pipeline/creative-direction/crew-types.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
function brief(): CrewBrief {
  return { project: { id: "p", language: "hatam", book: "mark", chapter: 2 },
    source: { text: [{ verse: 1, text: "Original words" }], reference: [{ verse: 1, text: "Exact reference words" }], hashes: ["source-hash"] },
    audio: [{ id: "audio", startMs: 0, endMs: 8000, path: "source.wav", speakerId: null, verseRef: "Mark 2:1", confidence: 95 }],
    canon: [{ id: "person", name: "Witness", versionId: "v1", notes: "Approved robe", joinedAt: null }],
    shots: [1, 2].map(n => ({ id: `s${n}`, sceneId: "scene", sceneSequence: 1, sequence: n, verseRef: "Mark 2:1", action: n === 1 ? "Roof intact" : "Roof is opened",
      framing: "medium", cameraMovement: "static", continuity: "Keep the established state", lighting: "Daylight", needsLipSync: false, characterIds: ["person"], dialogueCharacterId: null,
      beats: n === 1 ? [{ id: "beat", sequence: 1, notes: "A listener reaction", characterId: "person", startMs: 0, endMs: 4000 }] : [],
      clip: { id: `clip${n}`, path: `clip${n}.mp4`, durationMs: 4000 } })),
    producerNotes: [{ id: "note", subjectId: "p", note: "Preserve the approved wardrobe" }], spentUsd: 12,
    audioAssets: [{ id: "music", kind: "music", description: "Quiet cue", path: "music.wav", sha256: "music-hash", durationMs: 10000 }],
    render: { id: "render", path: "cut.mp4", durationMs: 8000, sha256: "cut-hash", timeline: [{ shotId: "s1", startMs: 0, endMs: 4000 }, { shotId: "s2", startMs: 4000, endMs: 8000 }],
      audioMap: [{ segmentId: "audio", sourceStartMs: 0, sourceEndMs: 8000, startMs: 0, endMs: 8000 }] }
  };
}
function response(role: CrewRole): CrewContribution {
  return { summary: `${role} checked the evidence.`, directions: [1,2].map(n => ({ shotId: `s${n}`, instruction: n === 1 ? "Preserve the intact roof" : "Show the opened roof", scriptureBasis: "Mark 2:1" })), findings: [],
    ...(role === "production_director" ? { decision: "approve" as const } : {}),
    ...(role === "picture_editor" ? { coverageRequests: [], edits: [], pauses: [] } : {}),
    ...(role === "colorist" ? { colorAdjustments: [] } : {}),
    ...(role === "sound_designer" || role === "composer" ? { audioCues: [], generationRequests: [] } : {}) };
}
const roleFromPrompt = (prompt: string): CrewRole => prompt.match(/You are HeartWord's ([^.]+)\./)![1]!.replaceAll(" ", "_") as CrewRole;

describe("coordinated filmmaking", () => {
  it("shows an imperfect edit to the crew but cannot approve it or release soundtrack generation", async () => {
    const b = brief();
    b.render!.timingAudit = { kind: "observed_cut_timing", renderId: "render", renderSha256: "cut-hash", durationMs: 8000,
      summary: "Observed missing narration", findings: ["Missing narration"], evidenceDirectory: "exports/audit", sourceHashes: ["source-hash"],
      picture: [], audio: [], unverifiedAudio: [{ segmentId: "audio", reason: "No matching speech" }] };
    const events: CrewEvent[] = [];
    const result = await runCrew({ phase: "finishing", brief: b, media: [{ mimeType: "video/mp4", data: "fixture" }],
      call: async prompt => response(roleFromPrompt(prompt)), log: e => events.push(e) });
    expect(result.status).toBe("held");
    expect(events.every(e => e.prompt.includes("Observed missing narration"))).toBe(true);
    // A mathematically complete table cannot erase measured problems in the same film.
    expect(structuralCutFindings(b).join(" ")).toContain("Missing narration");
  });
  it("gives every planning specialist the same exact chapter and the preceding decisions", async () => {
    const events: CrewEvent[] = [];
    const call = vi.fn(async (prompt: string) => response(roleFromPrompt(prompt)));
    const result = await runCrew({ phase: "planning", brief: brief(), call, log: e => events.push(e) });
    expect(result.status).toBe("approved");
    expect(events.map(e => e.role)).toEqual([...PLANNING_ROLES, "production_director"]);
    expect(events[1]!.prompt).toContain("creative_director checked the evidence");
    for (const event of events) for (const text of ["Exact reference words", "Original words", "Roof intact", "Roof is opened", "8000", "Approved robe", "Preserve the approved wardrobe"]) expect(event.prompt).toContain(text);
  });
  it("cannot approve over an independent supervisor's blocking finding", async () => {
    const result = await runCrew({ phase: "planning", brief: brief(), log: () => {}, call: async prompt => {
      const role = roleFromPrompt(prompt), out = response(role);
      if (role === "script_supervisor") out.findings.push({ shotId: "s1", severity: "blocking", evidence: "Roof opened too early", requestedChange: "Keep roof intact", confidence: 22, limitations: "The source requirement remains reviewable even though this visual inference is uncertain." });
      return out;
    } });
    expect(result.status).toBe("held");
    expect(result.summary).toContain("Blocking findings");
  });
  it("bounds revisions and retains the Director feedback for the second pass", async () => {
    const events: CrewEvent[] = [];
    const result = await runCrew({ phase: "planning", brief: brief(), log: e => events.push(e), call: async prompt => {
      const out = response(roleFromPrompt(prompt));
      if (roleFromPrompt(prompt) === "production_director") { out.decision = "revise"; out.summary = "Resolve the eyeline mismatch"; }
      return out;
    } });
    expect(result.status).toBe("held");
    expect(result.calls).toBe(22);
    expect(events[11]!.prompt).toContain("Resolve the eyeline mismatch");
  });
  it("stops at the overall call budget with an incomplete result", async () => {
    const call = vi.fn(async (prompt: string) => response(roleFromPrompt(prompt)));
    const result = await runCrew({ phase: "planning", brief: brief(), maxCalls: 3, call, log: () => {} });
    expect(result.status).toBe("incomplete"); expect(call).toHaveBeenCalledTimes(3);
  });
  it("records malformed responses as failed reviews rather than inventing approval", async () => {
    const events: CrewEvent[] = [];
    const result = await runCrew({ phase: "planning", brief: brief(), call: async () => ({ summary: "Fine" }), log: e => events.push(e) });
    expect(result.status).toBe("incomplete"); expect(result.calls).toBe(1); expect(events[0]!.error).toBeTruthy();
  });
  it("does not accept an empty design pass as a complete chapter plan", async () => {
    const out = response("creative_director"); out.directions = [];
    const result = await runCrew({ phase: "planning", brief: brief(), call: async () => out, log: () => {} });
    expect(result.status).toBe("incomplete"); expect(result.summary).toContain("every shot");
  });
  it("rejects foreign IDs, duplicated directions, unsafe field ownership and missing verdicts", () => {
    const out = response("creative_director");
    expect(() => validateContribution({ ...out, directions: [{ ...out.directions[0], shotId: "foreign" }] }, "creative_director", brief())).toThrow("foreign");
    expect(() => validateContribution({ ...out, directions: [out.directions[0], out.directions[0]] }, "creative_director", brief())).toThrow("Duplicate");
    expect(() => validateContribution({ ...out, colorAdjustments: [] }, "creative_director", brief())).toThrow("Unexpected");
    expect(() => validateContribution(out, "production_director", brief())).toThrow("decision");
  });
  it("requires bounded confidence and stated limits for each newly reported finding", () => {
    const finding = { shotId:"s1", severity:"advisory", evidence:"Visible continuity mismatch", requestedChange:"Inspect the adjacent shots", confidence:65, limitations:"The compressed proxy cannot establish fine detail." };
    expect(() => validateContribution({ ...response("creative_director"), findings:[{ ...finding, confidence:101 }] }, "creative_director", brief())).toThrow("Number outside");
    expect(() => validateContribution({ ...response("creative_director"), findings:[{ ...finding, confidence:"65" }] }, "creative_director", brief())).toThrow("Number outside");
    expect(validateContribution({ ...response("creative_director"), findings:[finding] }, "creative_director", brief()).findings[0]?.confidence).toBe(65);
  });
  it("treats missing coverage as blocking even if the Director approves", async () => {
    const result = await runCrew({ phase: "planning", brief: brief(), log: () => {}, call: async prompt => {
      const role = roleFromPrompt(prompt), out = response(role);
      if (role === "picture_editor") out.coverageRequests = [{ shotId: "s1", additionalMs: 2000, description: "Reaction", reason: "Cover narration" }];
      return out;
    } });
    expect(result.status).toBe("held");
  });
  it("requires audiovisual evidence for finishing and supplies it to every reviewer", async () => {
    const call = vi.fn(async (prompt: string) => response(roleFromPrompt(prompt)));
    const missing = await runCrew({ phase: "finishing", brief: brief(), call, log: () => {} });
    expect(missing.status).toBe("incomplete"); expect(call).not.toHaveBeenCalled();
    const media = [{ mimeType: "video/mp4", data: "test-video-with-audio" }];
    const done = await runCrew({ phase: "finishing", brief: brief(), media, call, log: () => {} });
    expect(done.status).toBe("approved"); expect(done.calls).toBe(FINISHING_ROLES.length + 1);
    expect(call).toHaveBeenLastCalledWith(expect.any(String), expect.any(Object), media);
  });
  it("invalidates source, canon and producer changes without invalidating planning when a clip is produced", () => {
    const b = brief(), hash = crewBriefHash(b, "planning");
    b.spentUsd = 25; b.shots[0]!.clip = null;
    expect(crewBriefHash(b, "planning")).toBe(hash);
    b.canon[0]!.versionId = "v2"; expect(crewBriefHash(b, "planning")).not.toBe(hash);
    const other = brief(); other.producerNotes.push({ id: "new", subjectId: "s1", note: "New direction" });
    expect(crewBriefHash(other, "planning")).not.toBe(hash);
  });
  it("persists role exchanges and incomplete review status without touching existing production data", async () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(readFileSync("src/db/schema.sql", "utf8"));
      db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1)");
      const result = await runProductionCrew("p", "planning", { db, brief: brief(), call: async () => { throw new Error("network unavailable"); } });
      expect(result.status).toBe("incomplete");
      expect(db.prepare("SELECT status FROM production_runs").get()!.status).toBe("incomplete");
      expect(db.prepare("SELECT error, cost_usd FROM production_events").get()).toMatchObject({ error: "network unavailable", cost_usd: null });
      expect(db.prepare("SELECT COUNT(*) AS n FROM cost_ledger_entries").get()!.n).toBe(0);
    } finally { db.close(); }
  });
  it("keeps coverage directions scoped to the chosen beat", () => {
    const result: CrewResult = { status: "approved", summary: "Ready", calls: 11, contributions: { creative_director: response("creative_director") } };
    const run = { id: "r", project_id: "p", phase: "planning" as const, brief_hash: "h", brief_json: JSON.stringify(brief()), result_json: JSON.stringify(result), status: "approved", created_at: 1 };
    expect(directionsFromRun(run, "s1", "beat")).toContain("Show only: A listener reaction");
    expect(() => directionsFromRun(run, "s2", "beat")).toThrow("not in");
  });
});

describe("finishing execution", () => {
  function result(): CrewResult { return { status: "approved", summary: "Ready", calls: 7,
    contributions: { colorist: response("colorist"), composer: response("composer"), sound_designer: response("sound_designer") } }; }
  it("identifies missing narration duration and timeline gaps independently of model opinions", () => {
    const b = brief(); b.render!.durationMs = 5000;
    expect(structuralCutFindings(b).join(" ")).toContain("beyond the cut");
    b.render!.timeline[1]!.startMs = 4100;
    expect(structuralCutFindings(b).join(" ")).toContain("gap");
  });
  it("builds bounded color and ducked audio filters without changing source timing", () => {
    const r = result(); r.contributions.colorist!.colorAdjustments = [{ shotId: "s2", brightness: 0.01, contrast: 1, saturation: 0.98, reason: "Match preceding light" }];
    r.contributions.composer!.audioCues = [{ assetId: "music", startMs: 1000, endMs: 5000, sourceStartMs: 0, gainDb: -24, reason: "Quiet response" }];
    const recipe = finishingRecipe(brief(), r);
    expect(recipe.inputs).toEqual(["music.wav"]); expect(recipe.filter).toContain("gte(t,4)*lt(t,8)");
    expect(recipe.filter).toContain("sidechaincompress"); expect(recipe.filter).not.toContain("atempo");
  });
  it("rejects unapproved assets, out-of-range color and stacked loud cues", () => {
    const b = brief(), r = result();
    r.contributions.composer!.audioCues = [{ assetId: "other", startMs: 0, endMs: 1000, sourceStartMs: 0, gainDb: -24, reason: "Music" }];
    expect(() => finishingRecipe(b, r)).toThrow("approved asset");
    r.contributions.composer!.audioCues = [1, 2].map(() => ({ assetId: "music", startMs: 0, endMs: 1000, sourceStartMs: 0, gainDb: -18, reason: "Music" }));
    expect(() => finishingRecipe(b, r)).toThrow("combined");
    r.contributions.composer!.audioCues = []; r.contributions.colorist!.colorAdjustments = [{ shotId: "s1", brightness: 5, contrast: 1, saturation: 1, reason: "Overexpose" }];
    expect(() => finishingRecipe(b, r)).toThrow("outside");
  });
});
