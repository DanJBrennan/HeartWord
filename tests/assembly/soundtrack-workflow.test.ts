import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateRequestedSoundtrack } from "../../src/pipeline/assembly/soundtrack.js";
import { crewBriefHash } from "../../src/pipeline/creative-direction/crew-context.js";
import type { CrewBrief, CrewResult } from "../../src/pipeline/creative-direction/crew-types.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: InstanceType<typeof DatabaseSync>, directory: string, brief: CrewBrief;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "heartword-soundtrack-test-"));
  db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1)");
  brief = { project: { id: "p", language: "hatam", book: "mark", chapter: 2 }, source: { text: [], reference: [], hashes: ["source"] },
    audio: [], shots: [], canon: [], producerNotes: [], spentUsd: 0, audioAssets: [],
    render: { id: "r", path: "cut.mp4", durationMs: 4000, sha256: "cut", timeline: [], audioMap: [] } };
  const result: CrewResult = { status: "awaiting_assets", calls: 7, summary: "Approved cue request", contributions: {
    composer: { summary: "Instrumental intro", findings: [], directions: [], audioCues: [], generationRequests: [{ startMs: 0, durationMs: 4000, prompt: "Quiet instrumental flute with a gentle rise", gainDb: -18, loop: false, reason: "An opening view" }] }
  } };
  db.prepare("INSERT INTO production_runs (id,project_id,phase,brief_hash,brief_json,status,result_json,created_at) VALUES ('run','p','finishing',?,?,'awaiting_assets',?,1)")
    .run(crewBriefHash(brief, "finishing"), JSON.stringify(brief), JSON.stringify(result));
});
afterEach(() => { db.close(); if (relative(tmpdir(), directory).startsWith("heartword-soundtrack-test-")) rmSync(directory, { recursive: true, force: true }); });
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
});
