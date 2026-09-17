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

const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const cleanup: string[] = [];
afterEach(() => { db?.close(); for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true }); });

function video(path: string, color: string) {
  mkdirSync(dirname(path), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=${color}:s=160x90:r=24:d=1`, "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path]);
}

describe.skipIf(!ffmpeg)("durable production recovery", () => {
  it("adopts only complete retained work and then resumes without executing a stage", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "heartword-durable-")); cleanup.push(dataDir); mkdirSync(join(dataDir, "assets"));
    db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
    for (const name of ["key.png", "ordinary.mp4", "speech.mp4", "chapter.mp4", "master.wav"]) {
      const path = join(dataDir, "assets", name); mkdirSync(dirname(path), { recursive: true });
      if (name.endsWith(".mp4")) video(path, name === "speech.mp4" ? "blue" : "red"); else writeFileSync(path, "synthetic approved fixture");
    }
    db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','synthetic','mark',1,1,1);
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
    const { adoptRecoveredPipeline, runPipeline } = await import("../../src/pipeline/orchestrator.js");
    const adopted = adoptRecoveredPipeline("p", "Synthetic producer");
    expect(adopted.stoppedAt).toBeUndefined(); expect(adopted.results).toHaveLength(7);
    expect(db.prepare("SELECT COUNT(*) n FROM stage_executions WHERE project_id='p' AND reason LIKE 'Producer Synthetic producer%'").get()).toMatchObject({ n: 7 });
    const resumed = await runPipeline("p");
    expect(resumed.stoppedAt).toBeUndefined();
    expect(resumed.results.every(result => result.reasoning.startsWith("Reused valid"))).toBe(true);
  }, 30000);
});
