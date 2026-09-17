import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: import("node:sqlite").DatabaseSync;
let dataDir = "";
vi.mock("../../src/db/client.js", () => ({ getDb: () => db, getDataDir: () => dataDir }));
const sync = vi.fn();
vi.mock("../../src/providers/kling/index.js", () => ({ KlingLipSyncProvider: class { sync = sync; } }));
vi.mock("../../src/providers/elevenlabs.js", () => ({ reVoiceAudio: vi.fn(async (_voice: string, path: string) => ({ audioBuffer: readFileSync(path) })) }));
// The crew model is the sole external boundary in this assembly acceptance
// test.  The real crew runner, editorial planner and FFmpeg renderer run.
vi.mock("../../src/providers/gemini-text.js", () => ({
  GEMINI_TEXT_MODEL: "fixture-crew",
  generateJsonWithImages: vi.fn(async (prompt: string) => {
    const role = prompt.match(/You are HeartWord's ([^.]+)\./)?.[1]?.replaceAll(" ", "_");
    const directions = ["narrator", "a", "b"].map(shotId => ({ shotId, instruction: "Preserve the exact approved source order.", scriptureBasis: "Mark 1:1" }));
    return {
      summary: `${role} reviewed the complete fixture cut.`, directions, findings: [],
      ...(role === "picture_editor" ? { coverageRequests: [], edits: [
        { shotId: "narrator", sourceStartMs: 0, durationMs: 500 },
        { shotId: "a", sourceStartMs: 0, durationMs: 1000 },
        { shotId: "b", sourceStartMs: 0, durationMs: 1000 }
      ], pauses: [] } : {}),
      ...(role === "colorist" ? { colorAdjustments: [] } : {}),
      ...(role === "sound_designer" || role === "composer" ? { audioCues: [], generationRequests: [] } : {}),
      ...(role === "production_director" ? { decision: "approve" } : {})
    };
  })
}));

const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const cleanup: string[] = [];
afterEach(() => { db?.close(); for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true }); });

function video(path: string, color: string) {
  mkdirSync(dirname(path), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=${color}:s=160x90:r=24:d=1`, "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path]);
}
function docx(text: string): Buffer {
  const name = Buffer.from("word/document.xml"), bytes = Buffer.from(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(bytes.length, 20); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 10); end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}

describe.skipIf(!ffmpeg)("durable production recovery", () => {
  it("adopts only complete retained work and then resumes without executing a stage", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "heartword-durable-")); cleanup.push(dataDir); mkdirSync(join(dataDir, "assets"));
    db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
    for (const name of ["key.png", "ordinary.mp4", "speech.mp4", "chapter.mp4", "master.wav"]) {
      const path = join(dataDir, "assets", name); mkdirSync(dirname(path), { recursive: true });
      if (name.endsWith(".mp4")) video(path, name === "speech.mp4" ? "blue" : "red"); else writeFileSync(path, "synthetic approved fixture");
    }
    db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',1,1,1);
      INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('s','p',1,'Mark 1:1','Mark 1:1',1);
      INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('c','Synthetic speaker','chapter','approved','Papuan',1,1);
      INSERT INTO character_versions (id,character_id,version_label,status,voice_id,created_at) VALUES ('v','c','synthetic-approved','approved','voice',1);
      INSERT INTO shots (id,scene_id,sequence,action,needs_lip_sync,dialogue_character_id,created_at) VALUES ('n','s',1,'Narrator view',0,NULL,1),('d','s',2,'Speaker says exact source interval',1,'c',1);
      INSERT INTO shot_characters VALUES ('d','c');
      INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,created_at) VALUES ('source','p','original_reading','master.wav',0,1000,'c','Mark 1:1',1),('master','p','composite_cast_master','master.wav',0,1000,'c','Mark 1:1',1);
      INSERT INTO composite_audio_source_map VALUES ('master','source','synthetic-hash','v',1);
      INSERT INTO shot_utterance_bindings VALUES ('bind','d','source',0,1000,'v','synthetic-hash',1,'producer');
      INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at) VALUES ('kn','n','synthetic','fixture','generate','accepted','key.png',0,1),('kd','d','synthetic','fixture','generate','accepted','key.png',0,1),('vn','n','synthetic','fixture','generate_final_video','accepted','ordinary.mp4',0,1),('vd','d','synthetic','fixture','lip_sync','accepted','speech.mp4',0,1);
      INSERT INTO clips VALUES ('cn','n','vn',0,1000,1),('cd','d','vd',0,1000,1);
      INSERT INTO chapter_renders VALUES ('r','p','chapter.mp4',1000,2,1);
      INSERT INTO stage_executions (id,project_id,stage,input_hash,dependency_hash,status,attempt,reason,started_at,completed_at,worker_token) VALUES ('old-qc','p','qc','old','old','completed',1,'synthetic independently reviewed QC',1,1,'old');`);
    const { adoptRecoveredPipeline, reconcileUncertainExecution, runPipeline } = await import("../../src/pipeline/orchestrator.js");
    const adopted = adoptRecoveredPipeline("p", "Synthetic producer");
    expect(adopted.stoppedAt).toBeUndefined(); expect(adopted.results).toHaveLength(7);
    expect(db.prepare("SELECT COUNT(*) n FROM stage_executions WHERE project_id='p' AND reason LIKE 'Producer Synthetic producer%'").get()).toMatchObject({ n: 7 });
    const resumed = await runPipeline("p");
    expect(resumed.stoppedAt).toBeUndefined();
    expect(resumed.results.every(result => result.reasoning.startsWith("Reused valid"))).toBe(true);
    // A live lease cannot be silently adopted over, even when a prior result
    // exists.  This preserves the active worker's authority and prevents a
    // second producer from creating a competing completion record.
    db.exec("INSERT INTO stage_executions (id,project_id,stage,input_hash,dependency_hash,status,attempt,reason,started_at,worker_token) VALUES ('live','p','qc','live','live','running',9,'provider request in flight',9,'live-worker')");
    expect(adoptRecoveredPipeline("p", "Another producer")).toMatchObject({ stoppedAt:"qc" });
    expect(db.prepare("SELECT status FROM stage_executions WHERE id='live'").get()).toMatchObject({status:"running"});
    const reconciled = db.prepare("SELECT input_hash,dependency_hash FROM stage_executions WHERE project_id='p' AND stage='qc' AND status='completed' ORDER BY attempt DESC LIMIT 1").get() as {input_hash:string;dependency_hash:string};
    db.prepare("UPDATE stage_executions SET status='uncertain',input_hash=?,dependency_hash=? WHERE id='live'").run(reconciled.input_hash,reconciled.dependency_hash);
    reconcileUncertainExecution("p", "live", "Synthetic producer");
    expect(db.prepare("SELECT status,reason FROM stage_executions WHERE id='live'").get()).toMatchObject({status:"completed",reason:expect.stringContaining("no provider retry")});
    await expect(runPipeline("p").then(result => result.results.at(-1))).resolves.toMatchObject({stage:"qc",ok:true});
  }, 30000);

  it("builds real cast-master intervals, never syncs narration, and resumes accepted exact utterances", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "heartword-speaking-")); cleanup.push(dataDir); mkdirSync(join(dataDir, "assets"));
    db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
    const assets = join(dataDir, "assets"); mkdirSync(join(assets, "source", "synthetic", "mark-1"), { recursive: true });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "libmp3lame", join(assets, "source", "synthetic", "mark-1", "mark-1-fcbh-audio.mp3")]);
    for (const [path, content] of [["source/hatam/mark-1/mark-1-text.docx", docx("1Original words.")], ["reference/english/mark-1/mark-1-text.docx", docx("1Reference words.")], ["ref.png", Buffer.from("approved reference")]] as const) { const absolute=join(assets,path); mkdirSync(dirname(absolute),{recursive:true}); writeFileSync(absolute,content); }
    writeFileSync(join(assets, "key.png"), "synthetic keyframe"); video(join(assets, "returned.mp4"), "green");
    sync.mockClear(); sync.mockResolvedValue({ media: { path: "returned.mp4" }, cost: { usd: 0 }, provenance: { provider: "mock-kling", model: "mock", prompt: "synthetic" } });
    db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',1,1,1);
      INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('s','p',1,'Mark 1:1','Mark 1:1',1);
      INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('speaker','Speaker','global','approved','Papuan',1,1);
      INSERT INTO character_versions (id,character_id,version_label,status,voice_provider,voice_id,created_at) VALUES ('voice','speaker','approved','approved','elevenlabs','synthetic',1);
      INSERT INTO character_assets (id,character_version_id,category,path,created_at) VALUES ('ref','voice','body_pose','ref.png',1);
      INSERT INTO shots (id,scene_id,sequence,action,verse_ref,needs_lip_sync,dialogue_character_id,created_at) VALUES ('narrator','s',1,'Narration','Mark 1:1',0,NULL,1),('a','s',2,'First exact line','Mark 1:1',1,'speaker',1),('b','s',3,'Second exact line','Mark 1:1',1,'speaker',1);
      INSERT INTO shot_characters VALUES ('a','speaker'),('b','speaker');
      INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,created_at) VALUES ('n','p','original_reading','source/synthetic/mark-1/mark-1-fcbh-audio.mp3',0,500,NULL,'Mark 1:1',1),('a-src','p','original_reading','source/synthetic/mark-1/mark-1-fcbh-audio.mp3',500,1500,'speaker','Mark 1:1',1),('b-src','p','original_reading','source/synthetic/mark-1/mark-1-fcbh-audio.mp3',1500,2500,'speaker','Mark 1:1',1);
      INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at) VALUES ('ka','a','fixture','fixture','generate','accepted','key.png',0,1),('kb','b','fixture','fixture','generate','accepted','key.png',0,1);`);
    const { bindShotUtterance } = await import("../../src/pipeline/voice-lipsync/utterance-binding.js");
    bindShotUtterance(db, { projectId: "p", shotId: "a", sourceSegmentId: "a-src", startMs: 500, endMs: 1500, characterVersionId: "voice", approvedBy: "producer" });
    bindShotUtterance(db, { projectId: "p", shotId: "b", sourceSegmentId: "b-src", startMs: 1500, endMs: 2500, characterVersionId: "voice", approvedBy: "producer" });
    const { runVoiceLipSync } = await import("../../src/pipeline/voice-lipsync/index.js");
    expect((await runVoiceLipSync("p")).ok).toBe(false); expect(sync).toHaveBeenCalledTimes(2);
    expect(db.prepare("SELECT COUNT(*) n FROM generation_attempts WHERE operation='lip_sync'").get()).toMatchObject({ n: 2 });
    const { acceptLipSyncCandidate } = await import("../../src/pipeline/voice-lipsync/candidate-selection.js");
    for (const row of db.prepare("SELECT id FROM generation_attempts WHERE operation='lip_sync'").all() as Array<{id:string}>) acceptLipSyncCandidate(db, "p", row.id);
    expect((await runVoiceLipSync("p")).ok).toBe(true); expect(sync).toHaveBeenCalledTimes(2);
    expect(db.prepare("SELECT COUNT(*) n FROM clips").get()).toMatchObject({ n: 2 });
    // The ordinary narration image has a real accepted final-video clip;
    // no artificial narration lip-sync is created.
    db.exec("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at) VALUES ('n-final','narrator','fixture','fixture','generate_final_video','accepted','returned.mp4',0,2),('n-assembled','narrator','fixture','fixture','assemble_shot','accepted','returned.mp4',0,3),('a-assembled','a','fixture','fixture','assemble_shot','accepted','returned.mp4',0,3),('b-assembled','b','fixture','fixture','assemble_shot','accepted','returned.mp4',0,3); INSERT INTO clips VALUES ('n-clip','narrator','n-final',0,500,2),('n-assembled-clip','narrator','n-assembled',0,500,3),('a-assembled-clip','a','a-assembled',0,1000,3),('b-assembled-clip','b','b-assembled',0,1000,3)");
    const { runAssembly } = await import("../../src/pipeline/assembly/index.js");
    const assembled = await runAssembly("p");
    expect(assembled.ok).toBe(true);
    const render = db.prepare("SELECT result_asset_path,total_duration_ms FROM chapter_renders WHERE project_id='p' ORDER BY created_at DESC LIMIT 1").get() as {result_asset_path:string;total_duration_ms:number};
    expect(readFileSync(join(assets, render.result_asset_path)).length).toBeGreaterThan(0);
    expect(render.total_duration_ms).toBeGreaterThanOrEqual(2400);
    const manifest = JSON.parse((db.prepare("SELECT source_audio_json FROM chapter_render_manifests WHERE render_id=(SELECT id FROM chapter_renders WHERE project_id='p' ORDER BY created_at DESC LIMIT 1)").get() as {source_audio_json:string}).source_audio_json);
    expect(manifest.map((entry: {segmentId:string}) => entry.segmentId)).toEqual(["n", "a-src", "b-src"]);
    expect(sync).toHaveBeenCalledTimes(2);
  }, 30000);
});
