import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runCrew, validateContribution } from "../../src/pipeline/creative-direction/crew.js";
import { crewBriefHash } from "../../src/pipeline/creative-direction/crew-context.js";
import { directionsFromRun, runProductionCrew } from "../../src/pipeline/creative-direction/crew-store.js";
import { finishingRecipe, structuralCutFindings } from "../../src/pipeline/assembly/finishing.js";
import { FINISHING_ROLES, PLANNING_ROLES, type CrewBrief, type CrewContribution, type CrewEvent, type CrewRole, type CrewResult } from "../../src/pipeline/creative-direction/crew-types.js";
import { executableProductionRolesFor } from "../../src/pipeline/creative-direction/role-registry.js";
import { EDITORIAL_CHECKS, editorialReviewTargets } from "../../src/pipeline/qc/editorial-review.js";
import { fixtureTreatment, fixtureTreatmentReview, fixtureCraftAssessment } from "../helpers/crew-treatment.js";
import { TREATMENT_REVIEW_ROLES } from "../../src/pipeline/creative-direction/emotional-treatment.js";
import { reconcileAvatarBudget } from "../../src/pipeline/voice-lipsync/performance-direction.js";

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
    ...(role === "creative_director" ? {emotionalTreatment:fixtureTreatment(brief())} : {}),
    ...(TREATMENT_REVIEW_ROLES.includes(role) ? {treatmentReview:fixtureTreatmentReview()} : {}),
    ...(role === "production_director" ? { decision: "approve" as const, acceptanceChecks:{status:"clear" as const,evidence:"Synthetic checks passed."} } : {}),
    ...(role === "picture_editor" ? {craftAssessment:fixtureCraftAssessment()} : {}),
    ...(role === "picture_editor" ? { coverageRequests: [], edits: [], pauses: [], editorialChecks: EDITORIAL_CHECKS.map(name => ({ name, status: "clear" as const, startMs: 0, endMs: 8000, evidence: "Inspected the complete audiovisual cut", requestedChange: "None" })) } : {}),
    ...(role === "colorist" ? { colorAdjustments: [] } : {}),
    ...(role === "sound_designer" || role === "composer" ? { audioCues: [], generationRequests: [] } : {}) };
}
const roleFromPrompt = (prompt: string): CrewRole => prompt.match(/You are HeartWord's ([^.]+)\./)![1]!.replaceAll(" ", "_") as CrewRole;

describe("coordinated filmmaking", () => {
  it("rejects invalid cue envelopes while preserving legacy cues without fades", () => {
    const b=brief(), out=response("composer");
    out.audioCues=[{assetId:"music",startMs:0,endMs:4000,sourceStartMs:0,gainDb:-24,reason:"Restrained music"}];
    expect(()=>validateContribution(out,"composer",b)).not.toThrow();
    out.audioCues[0]!.fadeInMs=3000;out.audioCues[0]!.fadeOutMs=2000;
    expect(()=>validateContribution(out,"composer",b)).toThrow("fades exceed");
    out.audioCues[0]!.fadeInMs=-1;out.audioCues[0]!.fadeOutMs=0;
    expect(()=>validateContribution(out,"composer",b)).toThrow();
    out.audioCues[0]!.fadeInMs=Number.NaN;
    expect(()=>validateContribution(out,"composer",b)).toThrow();
  });
  it("offers only approved assets of each sound role's kind and executes those cues", async () => {
    const b=brief();b.audioAssets.push({id:"approved-fx",kind:"sfx",description:"Reviewed room tone",path:"tone.wav",sha256:"tone-hash",durationMs:8000});
    const result=await runCrew({phase:"finishing",brief:b,media:[{mimeType:"video/mp4",data:"fixture"}],log:()=>{},call:async(prompt,schema)=>{
      const role=roleFromPrompt(prompt),out=response(role);
      if(role==="sound_designer"||role==="composer"){
        const id=role==="sound_designer"?"approved-fx":"music";
        expect((schema.properties as any).audioCues.items.properties.assetId.enum).toEqual([id]);
        out.audioCues=[{assetId:id,startMs:0,endMs:4000,sourceStartMs:0,gainDb:-24,reason:"Reviewed quiet accompaniment"}];
      }return out;
    }});
    expect(result.status,result.summary).toBe("approved");
    expect(finishingRecipe(b,result).inputs).toEqual(["tone.wav","music.wav"]);
  });
  it("requests missing music without inventing an approved asset or cue", async () => {
    const b=brief();b.audioAssets=[];
    const result=await runCrew({phase:"finishing",brief:b,media:[{mimeType:"video/mp4",data:"fixture"}],log:()=>{},call:async(prompt,schema)=>{
      const role=roleFromPrompt(prompt),out=response(role);
      if(role==="sound_designer"||role==="composer")expect((schema.properties as any).audioCues.maxItems).toBe(0);
      if(role==="composer")out.generationRequests=[{prompt:"Quiet instrumental strings without speech or singing",durationMs:4000,loop:false,startMs:0,gainDb:-24,reason:"Support the source encounter"}];
      return out;
    }});
    expect(result.status,result.summary).toBe("awaiting_assets");
    expect(result.contributions.composer!.audioCues).toEqual([]);
    expect(result.contributions.composer!.generationRequests).toHaveLength(1);expect(b.audioAssets).toEqual([]);
  });
  it("retains completed reviews and holds a future cue even if a caller ignores the schema", async () => {
    const b=brief(),events:CrewEvent[]=[];
    const result=await runCrew({phase:"finishing",brief:b,media:[{mimeType:"video/mp4",data:"fixture"}],log:e=>events.push(e),call:async prompt=>{
      const out=response(roleFromPrompt(prompt));if(roleFromPrompt(prompt)==="sound_designer")out.audioCues=[{assetId:"future-unapproved-fx",startMs:0,endMs:4000,sourceStartMs:0,gainDb:-24,reason:"Not registered"}];return out;
    }});
    expect(result.status).toBe("incomplete");expect(result.summary).toContain("approved asset");
    expect(events.slice(0,-1).every(e=>!e.error&&e.output)).toBe(true);
    expect(events.at(-1)!.error).toContain("approved asset");expect(b.audioAssets.map(a=>a.id)).toEqual(["music"]);
  });
  it("continues after a rejected first-pass reply without repeating completed roles or resetting the call cap", async () => {
    const events: CrewEvent[] = [];
    const first = await runCrew({ phase:"planning",brief:brief(),log:e=>events.push(e),call:async prompt=>{
      const role=roleFromPrompt(prompt),out=response(role);
      if(role==="picture_editor")out.pauses=[{afterSegmentId:null,durationMs:1000,reason:"Execution belongs in editing"}];
      return out;
    }});
    expect(first.status).toBe("incomplete");
    const completedRoles=events.filter(e=>!e.error).map(e=>e.role);
    const resumedEvents:CrewEvent[]=[];
    const resumeFirstPass={contributions:first.contributions,completedRoles,calls:first.calls,failedRole:"picture_editor" as const,previousError:events.at(-1)!.error!};
    const result=await runCrew({phase:"planning",brief:brief(),resumeFirstPass,log:e=>resumedEvents.push(e),call:async prompt=>response(roleFromPrompt(prompt))});
    expect(result.status).toBe("approved");
    expect(resumedEvents[0]!.role).toBe("picture_editor");
    expect(resumedEvents[0]!.prompt).toContain("PRIOR REJECTED REPLY");
    expect(resumedEvents.some(e=>completedRoles.includes(e.role))).toBe(false);
    expect(result.calls).toBe(first.calls+resumedEvents.length);
    expect(result.contributions.creative_director).toEqual(first.contributions.creative_director);
    const noCalls=vi.fn();
    const capped=await runCrew({phase:"planning",brief:brief(),maxCalls:first.calls,resumeFirstPass,call:noCalls,log:()=>{}});
    expect(capped.status).toBe("incomplete");expect(capped.calls).toBe(first.calls);expect(noCalls).not.toHaveBeenCalled();
  });
  it("rejects a reordered saved planning prefix before another provider call", async () => {
    const call=vi.fn();
    await expect(runCrew({phase:"planning",brief:brief(),call,log:()=>{},resumeFirstPass:{contributions:{cinematographer:response("cinematographer")},completedRoles:["cinematographer"],calls:2,failedRole:"picture_editor",previousError:"Invalid planning execution"}})).rejects.toThrow("exact saved first-pass prefix");
    expect(call).not.toHaveBeenCalled();
  });
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
    expect(events.map(e => e.role)).toEqual([...executableProductionRolesFor("planning").filter(role => role !== "production_director"), "fidelity_challenger", "clarity_challenger", "feasibility_challenger", "production_director"]);
    expect(events[1]!.prompt).toContain("creative_director checked the evidence");
    expect(events[0]!.prompt).toContain("IMPLIED EMOTION");
    expect(events[0]!.prompt).toContain("textual action triggers the emotion");
    expect(events[0]!.prompt).toContain("Dan's approved Kling Avatar preference");
    expect(events[0]!.prompt).toContain("You brood of vipers!");
    expect(events[0]!.prompt).toContain("Uncertain treatment is not positive by default");
    const [fidelity, clarity, feasibility, director] = events.slice(-4);
    for (const event of events.slice(0, -4)) for (const text of ["Exact reference words", "Original words", "Roof intact", "Roof is opened", "8000", "Approved robe", "Preserve the approved wardrobe"]) expect(event.prompt).toContain(text);
    // Every challenger and the Director still see the shared story and shot plan.
    for (const event of [fidelity, clarity, feasibility, director]) for (const text of ["Exact reference words", "Roof intact", "Roof is opened", "8000"]) expect(event.prompt).toContain(text);
    // Each challenger's brief is narrowed to its own lens (challengerBrief in crew.ts) so
    // three independent reviewers don't all just restate the same canon note.
    expect(fidelity!.prompt).toContain("Original words");
    expect(fidelity!.prompt).toContain("Approved robe");
    expect(clarity!.prompt).toContain("Original words");
    expect(clarity!.prompt).not.toContain("Approved robe");
    expect(feasibility!.prompt).not.toContain("Original words");
    expect(feasibility!.prompt).not.toContain("Approved robe");
    expect(feasibility!.prompt).not.toContain("Preserve the approved wardrobe");
    // The Director is unrestricted -- it must weigh every specialist's full evidence.
    expect(director!.prompt).toContain("Approved robe");
    expect(director!.prompt).toContain("Preserve the approved wardrobe");
    expect(EDITORIAL_CHECKS).toContain("implied_emotion");
    expect(EDITORIAL_CHECKS).toContain("chapter_handoff");
  });
  it("attaches canon reference images only to roles whose job is inherently visual", async () => {
    const seenMedia: Record<string, unknown> = {};
    const seenPrompt: Record<string, string> = {};
    const visualMedia = [{ mimeType: "image/png", data: "ref", caption: "Canon reference image for \"Witness\":" }];
    await runCrew({ phase: "planning", brief: brief(), visualMedia, log: () => {}, call: async (prompt, _schema, media) => {
      const role = roleFromPrompt(prompt);
      seenMedia[role] = media; seenPrompt[role] = prompt;
      return response(role);
    } });
    for (const role of ["cinematographer", "costume_designer", "staging_designer", "fidelity_challenger"]) {
      expect(seenMedia[role]).toEqual(visualMedia);
      expect(seenPrompt[role]).toContain("canon reference images");
    }
    for (const role of ["creative_director", "choreographer", "lighting_designer", "script_supervisor", "picture_editor", "scripture_cultural_reviewer", "clarity_challenger", "feasibility_challenger", "production_director"]) {
      expect(seenMedia[role]).toEqual([]);
      expect(seenPrompt[role]).not.toContain("canon reference images");
    }
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
    expect(result.calls).toBe(30);
    expect(events[15]!.prompt).toContain("Resolve the eyeline mismatch");
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
    const {emotionalTreatment:_treatment,...withoutDecision}=out;
    expect(() => validateContribution(withoutDecision, "production_director", brief())).toThrow("decision");
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
    expect(done.status).toBe("approved"); expect(done.calls).toBe(executableProductionRolesFor("finishing").filter(role => role !== "production_director").length + 4);
    expect(call).toHaveBeenLastCalledWith(expect.any(String), expect.any(Object), media);
  });
  it("holds a finishing review if a speaking mouth or other editorial check is uncertain", async () => {
    const result = await runCrew({ phase: "finishing", brief: brief(), media: [{ mimeType: "video/mp4", data: "fixture" }], log: () => {}, call: async prompt => {
      const out = response(roleFromPrompt(prompt));
      if (roleFromPrompt(prompt) === "picture_editor") out.editorialChecks!.find(c => c.name === "speaker_mouth")!.status = "unverified";
      return out;
    } });
    expect(result.status).toBe("held");
    expect(result.summary).toContain("speaker_mouth");
  });
  it("holds an unsupported implied-emotion verdict for producer review", async () => {
    const result = await runCrew({ phase: "finishing", brief: brief(), media: [{ mimeType: "video/mp4", data: "fixture" }], log: () => {}, call: async prompt => {
      const out = response(roleFromPrompt(prompt));
      if (roleFromPrompt(prompt) === "picture_editor") out.editorialChecks!.find(c => c.name === "implied_emotion")!.status = "unverified";
      return out;
    } });
    expect(result.status).toBe("held");
    expect(result.summary).toContain("implied_emotion");
  });
  it("holds an unverified final chapter handoff", async () => {
    const result = await runCrew({ phase: "finishing", brief: brief(), media: [{ mimeType: "video/mp4", data: "fixture" }], log: () => {}, call: async prompt => {
      const out = response(roleFromPrompt(prompt));
      if (roleFromPrompt(prompt) === "picture_editor") out.editorialChecks!.find(c => c.name === "chapter_handoff")!.status = "unverified";
      return out;
    } });
    expect(result.status).toBe("held");
    expect(result.summary).toContain("chapter_handoff");
  });
  it("rejects a missing editorial checklist instead of approving an unexamined cut", async () => {
    const result = await runCrew({ phase: "finishing", brief: brief(), media: [{ mimeType: "video/mp4", data: "fixture" }], log: () => {}, call: async prompt => {
      const out = response(roleFromPrompt(prompt));
      if (roleFromPrompt(prompt) === "picture_editor") delete out.editorialChecks;
      return out;
    } });
    expect(result.status).toBe("incomplete");
    expect(result.summary).toContain("every whole-cut editorial check");
  });
  it("targets repeated placements without treating metadata as visual proof", () => {
    const b = brief();
    b.render!.timeline = [{ shotId: "s1", startMs: 0, endMs: 8000 }, { shotId: "s1", startMs: 8000, endMs: 16000 }];
    expect(editorialReviewTargets(b).join(" ")).toContain("0-16000 ms");
    expect(editorialReviewTargets(brief())).toEqual([]);
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
  it("records the real Gemini call's estimated cost on its event and in the cost ledger, using no injected call", async () => {
    const db = new DatabaseSync(":memory:");
    const originalKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubEnv("HEARTWORD_CREW_CALL_UPPER_BOUND_USD", "1");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(response("creative_director")) }] } }],
      usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 100, totalTokenCount: 600 }
    }) })));
    try {
      db.exec(readFileSync("src/db/schema.sql", "utf8"));
      db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1)");
      reconcileAvatarBudget(db,{projectId:"p",actor:"Synthetic reviewer",evidence:"No external fixture costs or liabilities.",unreportedUpperBoundUsd:0,outstandingUpperBoundUsd:0,idempotencyKey:"fixture-budget"});
      // maxCalls: 1 means only the first role (creative_director) is actually
      // called before the second role hits the budget and the run reports
      // incomplete -- exactly one real call, so one event and one ledger row.
      const result = await runProductionCrew("p", "planning", { db, brief: brief(), maxCalls: 1 });
      expect(result.calls).toBe(1);
      const expectedCostUsd = 500 * 0.75 / 1e6 + 100 * 3.75 / 1e6;
      const event = db.prepare("SELECT role, cost_usd FROM production_events").get() as { role: string; cost_usd: number };
      expect(event.role).toBe("creative_director");
      expect(event.cost_usd).toBeCloseTo(expectedCostUsd, 10);
      const ledger = db.prepare("SELECT project_id, generation_attempt_id, amount_usd FROM cost_ledger_entries").get() as { project_id: string; generation_attempt_id: string | null; amount_usd: number };
      expect(ledger.project_id).toBe("p");
      expect(ledger.generation_attempt_id).toBeNull();
      expect(ledger.amount_usd).toBeCloseTo(expectedCostUsd, 10);
    } finally {
      db.close();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
    }
  });
  it("keeps coverage directions scoped to the chosen beat", () => {
    const result: CrewResult = { status: "approved", summary: "Ready", calls: 11, contributions: { creative_director: response("creative_director"), production_director: response("production_director") } };
    const run = { id: "r", project_id: "p", phase: "planning" as const, brief_hash: "h", brief_json: JSON.stringify(brief()), result_json: JSON.stringify(result), status: "approved", created_at: 1 };
    expect(directionsFromRun(run, "s1", "beat")).toContain("Show only: A listener reaction");
    expect(() => directionsFromRun(run, "s2", "beat")).toThrow("not in");
  });
  it("sends only the Production Director's own direction to media generation, not other roles'", () => {
    const cd = response("creative_director"); cd.directions[0]!.instruction = "Creative director's take on s1";
    const pd = response("production_director"); pd.directions[0]!.instruction = "Director's final merged instruction for s1";
    const result: CrewResult = { status: "approved", summary: "Ready", calls: 13, contributions: { creative_director: cd, production_director: pd } };
    const run = { id: "r", project_id: "p", phase: "planning" as const, brief_hash: "h", brief_json: JSON.stringify(brief()), result_json: JSON.stringify(result), status: "approved", created_at: 1 };
    const output = directionsFromRun(run, "s1");
    expect(output).toContain("Director's final merged instruction for s1");
    expect(output).not.toContain("Creative director's take on s1");
  });
  it("refuses to treat a plan as reviewable if the Production Director skipped a shot", () => {
    const result: CrewResult = { status: "approved", summary: "Ready", calls: 13, contributions: { production_director: { ...response("production_director"), directions: [response("production_director").directions[0]!] } } };
    const run = { id: "r", project_id: "p", phase: "planning" as const, brief_hash: "h", brief_json: JSON.stringify(brief()), result_json: JSON.stringify(result), status: "approved", created_at: 1 };
    expect(() => directionsFromRun(run, "s2")).toThrow("did not direct this shot");
  });
  it("requires the Production Director, like every design specialist, to cover every shot before approving", async () => {
    const result = await runCrew({ phase: "planning", brief: brief(), log: () => {}, call: async prompt => {
      const role = roleFromPrompt(prompt), out = response(role);
      if (role === "production_director") out.directions = out.directions.slice(0, 1);
      return out;
    } });
    expect(result.status).toBe("incomplete");
    expect(result.summary).toContain("every shot");
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
