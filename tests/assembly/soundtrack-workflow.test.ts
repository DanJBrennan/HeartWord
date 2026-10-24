import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateRequestedSoundtrack } from "../../src/pipeline/assembly/soundtrack.js";
import { crewBriefHash } from "../../src/pipeline/creative-direction/crew-context.js";
import type { CrewBrief, CrewResult } from "../../src/pipeline/creative-direction/crew-types.js";
import { checkFilmSpend, reconcileAvatarBudget } from "../../src/pipeline/voice-lipsync/performance-direction.js";
import { generateJsonWithImagesMetered } from "../../src/providers/gemini-text.js";
vi.mock("../../src/providers/gemini-text.js", async importOriginal => ({ ...await importOriginal<typeof import("../../src/providers/gemini-text.js")>(), generateJsonWithImagesMetered: vi.fn() }));
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: InstanceType<typeof DatabaseSync>, directory: string, brief: CrewBrief;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "heartword-soundtrack-test-"));
  db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1)");
  vi.stubEnv("HEARTWORD_SOUNDTRACK_CALL_UPPER_BOUND_USD", "5");
  vi.mocked(generateJsonWithImagesMetered).mockReset();
  reconcileAvatarBudget(db,{projectId:"p",actor:"Synthetic cost fixture",evidence:"Synthetic empty ledger and no prior unreported charges; five-dollar bound covers each fake audio request and review",unreportedUpperBoundUsd:0,outstandingUpperBoundUsd:0,idempotencyKey:"fixture-budget"});
  brief = { project: { id: "p", language: "hatam", book: "mark", chapter: 2 }, source: { text: [], reference: [], hashes: ["source"] },
    audio: [], shots: [], canon: [], producerNotes: [], spentUsd: 0, audioAssets: [],
    render: { id: "r", path: "cut.mp4", durationMs: 4000, sha256: "cut", timeline: [], audioMap: [] } };
  const result: CrewResult = { status: "awaiting_assets", calls: 7, summary: "Approved cue request", contributions: {
    composer: { summary: "Instrumental intro", findings: [], directions: [], audioCues: [], generationRequests: [{ startMs: 0, durationMs: 4000, prompt: "Quiet instrumental flute with a gentle rise", gainDb: -18, loop: false, reason: "An opening view" }] }
  } };
  db.prepare("INSERT INTO production_runs (id,project_id,phase,brief_hash,brief_json,status,result_json,created_at) VALUES ('run','p','finishing',?,?,'awaiting_assets',?,1)")
    .run(crewBriefHash(brief, "finishing"), JSON.stringify(brief), JSON.stringify(result));
});
afterEach(() => { db.close(); vi.unstubAllEnvs(); if (relative(tmpdir(), directory).startsWith("heartword-soundtrack-test-")) rmSync(directory, { recursive: true, force: true }); });
const provider = () => ({ generate: vi.fn(async () => ({ bytes: Buffer.from("audio fixture"), mimeType: "audio/mpeg", provider: "test", model: "test", usage: { samples: 1 }, requestId: "request" })) });
const pass = async () => ({ matchesBrief: true, speechDetected: false, intelligibleSpeech: false, technicalPass: true, confidence: 90, reason: "Instrumental and fits the requested development." });
describe("directed soundtrack generation", () => {
  it("holds unintelligible ambience voices even when no dialogue words are understood", async () => {
    const music=provider();
    const options={db,dataDir:directory,brief,music,review:async()=>({...await pass(),speechDetected:true,reason:"Unintelligible background voices"}),duration:()=>4000};
    expect((await generateRequestedSoundtrack("p","run",options)).accepted).toBe(0);
    expect(db.prepare("SELECT COUNT(*) n FROM production_audio_assets").get()!.n).toBe(0);
    await generateRequestedSoundtrack("p","run",options);expect(music.generate).toHaveBeenCalledTimes(1);
  });
  it("records provider usage, reviews the audio, and reuses a completed request after its asset enters the brief", async () => {
    const music = provider();
    const options = { db, dataDir: directory, brief, music, review: pass, duration: () => 4000 };
    expect(await generateRequestedSoundtrack("p", "run", options)).toEqual({ accepted: 1, failures: [] });
    brief.audioAssets = db.prepare("SELECT id,kind,description,path,sha256,duration_ms AS durationMs FROM production_audio_assets").all() as unknown as CrewBrief["audioAssets"];
    expect(await generateRequestedSoundtrack("p", "run", options)).toEqual({ accepted: 1, failures: [] });
    expect(music.generate).toHaveBeenCalledTimes(1);
    const attempt = db.prepare("SELECT status,cost_usd,usage_json,review_json FROM soundtrack_attempts").get()!;
    expect(attempt.status).toBe("accepted"); expect(attempt.cost_usd).toBeNull(); expect(attempt.usage_json).toContain("request"); expect(attempt.review_json).toContain("90");
  });
  it("holds failed listening reviews and never automatically buys another attempt", async () => {
    const music = provider();
    const options = { db, dataDir: directory, brief, music, review: async () => ({ ...await pass(), intelligibleSpeech: true }), duration: () => 4000 };
    expect((await generateRequestedSoundtrack("p", "run", options)).accepted).toBe(0);
    expect((await generateRequestedSoundtrack("p", "run", options)).failures[0]).toContain("previous attempt is held");
    expect(music.generate).toHaveBeenCalledTimes(1); expect(db.prepare("SELECT COUNT(*) AS n FROM production_audio_assets").get()!.n).toBe(0);
  });
  it("preserves an uncertain provider request and blocks stale cuts before spending", async () => {
    const music = { generate: vi.fn(async () => { throw new Error("Connection lost after submission"); }) };
    const options = { db, dataDir: directory, brief, music, review: pass, duration: () => 4000 };
    await generateRequestedSoundtrack("p", "run", options); await generateRequestedSoundtrack("p", "run", options);
    expect(music.generate).toHaveBeenCalledTimes(1);
    brief.render!.sha256 = "changed";
    await expect(generateRequestedSoundtrack("p", "run", options)).rejects.toThrow("stale");
    expect(music.generate).toHaveBeenCalledTimes(1);
  });
  it("retains short audio without approving or stretching it", async () => {
    const review = vi.fn(pass);
    const result = await generateRequestedSoundtrack("p", "run", { db, dataDir: directory, brief, music: provider(), review, duration: () => 2000 });
    expect(result.accepted).toBe(0); expect(result.failures[0]).toContain("shorter"); expect(review).not.toHaveBeenCalled();
    expect(db.prepare("SELECT path,status FROM soundtrack_attempts").get()).toMatchObject({ path: expect.stringContaining(".mp3"), status: "incomplete" });
  });
  it("requires an evidenced per-request bound and reconciled film budget before any provider call or claim", async () => {
    const music=provider(),review=vi.fn(pass),options={db,dataDir:directory,brief,music,review,duration:()=>4000};
    vi.stubEnv("HEARTWORD_SOUNDTRACK_CALL_UPPER_BOUND_USD", "");
    await expect(generateRequestedSoundtrack("p","run",options)).rejects.toThrow("evidenced");
    vi.stubEnv("HEARTWORD_SOUNDTRACK_CALL_UPPER_BOUND_USD", "5");
    db.exec("DELETE FROM edit_commands WHERE command_type='reconcile_avatar_budget'");
    await expect(generateRequestedSoundtrack("p","run",options)).rejects.toThrow("reconcile");
    expect(music.generate).not.toHaveBeenCalled();expect(review).not.toHaveBeenCalled();
    expect(db.prepare("SELECT COUNT(*)n FROM soundtrack_attempts").get()!.n).toBe(0);
    expect(db.prepare("SELECT COUNT(*)n FROM edit_commands WHERE command_type='reserve_crew_spend'").get()!.n).toBe(0);
  });
  it("settles explicitly reported generation plus listening charges once and reuses accepted audio", async () => {
    const music={generate:vi.fn(async()=>({...await provider().generate(),costUsd:.2}))},review=vi.fn(async()=>({verdict:await pass(),costUsd:.03}));
    const options={db,dataDir:directory,brief,music,review,duration:()=>4000};
    expect(await generateRequestedSoundtrack("p","run",options)).toEqual({accepted:1,failures:[]});
    expect(db.prepare("SELECT cost_usd FROM soundtrack_attempts").get()!.cost_usd).toBeCloseTo(.23);
    expect(db.prepare("SELECT cost_usd FROM production_events WHERE role='soundtrack_generation_and_review'").get()!.cost_usd).toBeCloseTo(.23);
    expect(checkFilmSpend(db,"p",0).committedUsd).toBeCloseTo(.23);
    expect(db.prepare("SELECT COUNT(*)n FROM edit_commands WHERE command_type='settle_crew_spend'").get()!.n).toBe(1);
    await generateRequestedSoundtrack("p","run",options);
    expect(music.generate).toHaveBeenCalledTimes(1);expect(review).toHaveBeenCalledTimes(1);
    expect(db.prepare("SELECT COUNT(*)n FROM cost_ledger_entries").get()!.n).toBe(1);
  });
  it("retains an unknown generation charge and existing liabilities, stopping the next cue at the cumulative ceiling", async () => {
    db.exec("INSERT INTO cost_ledger_entries(id,project_id,amount_usd,created_at)VALUES('history','p',190,1)");
    reconcileAvatarBudget(db,{projectId:"p",actor:"Synthetic cost fixture",evidence:"Existing rejected/history ledger plus2unreported and1external outstanding; neither is zero",unreportedUpperBoundUsd:2,outstandingUpperBoundUsd:1,idempotencyKey:"history-budget"});
    const row=db.prepare("SELECT result_json FROM production_runs WHERE id='run'").get()!,result=JSON.parse(String(row.result_json));
    result.contributions.composer.generationRequests.push({...result.contributions.composer.generationRequests[0],prompt:"Another cue"});
    db.prepare("UPDATE production_runs SET result_json=? WHERE id='run'").run(JSON.stringify(result));
    const music=provider(),review=vi.fn(async()=>({verdict:await pass(),costUsd:.03})),options={db,dataDir:directory,brief,music,review,duration:()=>4000};
    await expect(generateRequestedSoundtrack("p","run",options)).rejects.toThrow("$200");
    expect(music.generate).toHaveBeenCalledTimes(1);expect(review).toHaveBeenCalledTimes(1);
    expect(db.prepare("SELECT status,cost_usd FROM soundtrack_attempts").all()).toEqual([{status:"accepted",cost_usd:null}]);
    expect(db.prepare("SELECT cost_usd FROM production_events WHERE role='soundtrack_generation_and_review'").get()!.cost_usd).toBeNull();
    expect(checkFilmSpend(db,"p",0).committedUsd).toBeCloseTo(198.03);
    const saved=JSON.parse(String(db.prepare("SELECT payload FROM edit_commands WHERE command_type='reconcile_avatar_budget' ORDER BY sequence DESC LIMIT 1").get()!.payload));
    expect(saved.input).toMatchObject({unreportedUpperBoundUsd:2,outstandingUpperBoundUsd:1});
    expect(db.prepare("SELECT COUNT(*)n FROM edit_commands WHERE command_type='reserve_crew_spend'").get()!.n).toBe(1);
  });
  it("keeps a returned file and known subtotal when listening fails, without automatically retrying either request", async () => {
    const music={generate:vi.fn(async()=>({...await provider().generate(),costUsd:.2}))},review=vi.fn(async()=>{throw Error("Lost listening response");});
    const options={db,dataDir:directory,brief,music,review,duration:()=>4000};
    expect((await generateRequestedSoundtrack("p","run",options)).failures.join(" ")).toContain("Lost listening response");
    const row=db.prepare("SELECT path,cost_usd,usage_json FROM soundtrack_attempts").get()!;
    expect(row.cost_usd).toBeNull();expect(existsSync(join(directory,"assets",String(row.path)))).toBe(true);
    expect(JSON.parse(String(row.usage_json))).toMatchObject({knownSubtotalUsd:.2,reservationRetained:true,reviewSubmitted:true});
    expect(checkFilmSpend(db,"p",0).committedUsd).toBeCloseTo(5.2);
    await generateRequestedSoundtrack("p","run",options);expect(music.generate).toHaveBeenCalledTimes(1);expect(review).toHaveBeenCalledTimes(1);
  });
  it("does not silently reconcile another request's new unknown charge before buying a listening review", async () => {
    const music={generate:vi.fn(async()=>{db.exec("INSERT INTO production_events(id,run_id,sequence,role,round,prompt,model,cost_usd,created_at)VALUES('other','run',999,'foreign',1,'Foreign uncertain call','fixture',NULL,1)");return{...await provider().generate(),costUsd:.2};})},review=vi.fn(pass);
    const result=await generateRequestedSoundtrack("p","run",{db,dataDir:directory,brief,music,review,duration:()=>4000});
    expect(result.failures.join(" ")).toContain("reconciliation");expect(music.generate).toHaveBeenCalledTimes(1);expect(review).not.toHaveBeenCalled();
    expect(db.prepare("SELECT cost_usd FROM production_events WHERE id='other'").get()!.cost_usd).toBeNull();
    expect(db.prepare("SELECT cost_usd,path FROM soundtrack_attempts").get()).toMatchObject({cost_usd:.2,path:expect.stringContaining(".mp3")});
    expect(()=>checkFilmSpend(db,"p",0)).toThrow("reconciliation");
  });
  it("uses metered default listening and retains a bound if its usage is absent", async () => {
    const music={generate:vi.fn(async()=>({...await provider().generate(),costUsd:.2}))};
    vi.mocked(generateJsonWithImagesMetered).mockResolvedValue({result:await pass(),costUsd:.03,usage:undefined});
    expect(await generateRequestedSoundtrack("p","run",{db,dataDir:directory,brief,music,duration:()=>4000})).toEqual({accepted:1,failures:[]});
    expect(generateJsonWithImagesMetered).toHaveBeenCalledTimes(1);
    expect(db.prepare("SELECT cost_usd FROM soundtrack_attempts").get()!.cost_usd).toBeNull();
    expect(checkFilmSpend(db,"p",0).committedUsd).toBeCloseTo(5.2);
  });
  it("preserves a completed listening finding when its reported dollar charge is invalid", async () => {
    const music={generate:vi.fn(async()=>({...await provider().generate(),costUsd:.2}))},review=vi.fn(async()=>({verdict:await pass(),costUsd:-1}));
    const options={db,dataDir:directory,brief,music,review,duration:()=>4000};
    expect((await generateRequestedSoundtrack("p","run",options)).failures.join(" ")).toContain("Invalid reported");
    const row=db.prepare("SELECT status,cost_usd,review_json FROM soundtrack_attempts").get()!;
    expect(row).toMatchObject({status:"incomplete",cost_usd:null});expect(JSON.parse(String(row.review_json))).toMatchObject({confidence:90,matchesBrief:true});
    expect(checkFilmSpend(db,"p",0).committedUsd).toBeCloseTo(5.2);
    await generateRequestedSoundtrack("p","run",options);expect(music.generate).toHaveBeenCalledTimes(1);expect(review).toHaveBeenCalledTimes(1);
  });
  it("holds changed audio bytes while retaining the actual prior listening finding and charges", async () => {
    const music={generate:vi.fn(async()=>({...await provider().generate(),costUsd:.2}))};
    const review=vi.fn(async()=>{const path=String(db.prepare("SELECT path FROM soundtrack_attempts").get()!.path);writeFileSync(join(directory,"assets",path),"changed audio fixture");return{verdict:await pass(),costUsd:.03};});
    const result=await generateRequestedSoundtrack("p","run",{db,dataDir:directory,brief,music,review,duration:()=>4000});
    expect(result.accepted).toBe(0);expect(result.failures.join(" ")).toContain("bytes changed");
    expect(db.prepare("SELECT COUNT(*)n FROM production_audio_assets").get()!.n).toBe(0);
    expect(JSON.parse(String(db.prepare("SELECT review_json FROM soundtrack_attempts").get()!.review_json))).toMatchObject({confidence:90});
    expect(checkFilmSpend(db,"p",0).committedUsd).toBeCloseTo(.23);
  });
});
