/** Identify Jesus on the retained 3B base, then submit the exact bound Hatam interval. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const SHOT_ID = "b3d64f2d-90ff-4b6c-8cda-dd98391a0d50";
const BEAT_ID = "fe4b14c2-d85c-4991-a726-1cc2da8ce2ff";
const BASE_TASK_ID = "931868133391597592";
const BASE_REL_PATH = join("generated", "video", `mark3-scene1-shot3b-base-${BASE_TASK_ID}.mp4`);

const db = getDb();
const dataDir = getDataDir();

function probeMs(path: string): number {
  return Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], { encoding: "utf8" }).trim()) * 1000);
}

async function hostedVideoUrl(): Promise<string> {
  const key = process.env.KLING_API_KEY_1;
  if (!key) throw Error("Kling API key is unavailable.");
  const response = await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${BASE_TASK_ID}`, { headers: { Authorization: `Bearer ${key}` } });
  const result = await response.json() as { code: number; data?: { task_status: string; task_result?: { videos?: Array<{ url?: string }> } } };
  const url = result.data?.task_result?.videos?.[0]?.url;
  if (!response.ok || result.code !== 0 || result.data?.task_status !== "succeed" || !url) throw Error("Recorded 3B base is not available from Kling.");
  return url;
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "identify" && mode !== "sync") throw Error("Use identify or sync.");
  const beat = db.prepare("SELECT cb.*, ck.status AS keyframe_status FROM coverage_beats cb JOIN coverage_keyframe_attempts ck ON ck.coverage_beat_id=cb.id AND ck.result_asset_path=cb.keyframe_asset_path WHERE cb.id=? AND cb.shot_id=?")
    .get(BEAT_ID, SHOT_ID) as { status: string; keyframe_status: string; audio_start_ms: number; audio_end_ms: number; needs_lip_sync: number } | undefined;
  if (!beat || beat.status !== "accepted" || beat.keyframe_status !== "accepted" || beat.needs_lip_sync !== 1) throw Error("3B coverage/keyframe approval is missing.");
  const base = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_coverage_base' AND status='hold_for_review' AND result_asset_path=?")
    .get(SHOT_ID, BASE_REL_PATH) as { id: string } | undefined;
  const basePath = join(dataDir, "assets", BASE_REL_PATH);
  if (!base || !existsSync(basePath) || probeMs(basePath) < beat.audio_end_ms - beat.audio_start_ms) throw Error("Full-length retained base is unavailable.");
  const provider = new KlingFaceLipSyncProvider();
  const url = await hostedVideoUrl();
  if (mode === "identify") {
    const faces = await provider.identifyFaces(url);
    const dir = join(dataDir, "assets", "generated", "face-thumbs", BEAT_ID, BASE_TASK_ID);
    mkdirSync(dir, { recursive: true });
    const saved = [];
    for (const face of faces) {
      const response = await fetch(face.thumbnailUrl);
      if (!response.ok) throw Error(`Face ${face.faceId} thumbnail download failed: ${response.status}`);
      const path = join(dir, `face-${face.faceId}.jpg`);
      writeFileSync(path, Buffer.from(await response.arrayBuffer()));
      saved.push({ faceId: face.faceId, path, startTime: face.startTime, endTime: face.endTime });
    }
    console.log(JSON.stringify(saved));
    return;
  }
  const faceId = process.argv[3];
  if (!faceId) throw Error("Pass the visually confirmed Jesus face ID.");
  const prior = db.prepare("SELECT id,status FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' ORDER BY created_at DESC LIMIT 1").get(SHOT_ID) as { id: string; status: string } | undefined;
  if (prior) throw Error(`3B already has a lip-sync candidate ${prior.id} (${prior.status}).`);
  const rows = db.prepare(`SELECT ub.source_start_ms,ub.source_end_ms,ub.source_hash,ub.character_version_id,
      original.start_ms AS original_start,original.end_ms AS original_end,
      composite.source_path,composite.start_ms AS composite_start,composite.end_ms AS composite_end,
      map.source_hash AS composite_hash,map.voice_version_id,
      bound.voice_id AS bound_voice,bound.voice_provider AS bound_provider,
      current.voice_id AS current_voice,current.voice_provider AS current_provider
    FROM shot_utterance_bindings ub
    JOIN audio_segments original ON original.id=ub.source_audio_segment_id
    JOIN composite_audio_source_map map ON map.original_segment_id=original.id
    JOIN audio_segments composite ON composite.id=map.composite_segment_id AND composite.project_id=? AND composite.layer='composite_cast_master'
    JOIN character_versions bound ON bound.id=ub.character_version_id
    JOIN character_versions current ON current.id=map.voice_version_id AND current.character_id=bound.character_id AND current.status='approved'
    WHERE ub.shot_id=?`).all(PROJECT_ID, SHOT_ID) as Array<{ source_start_ms: number; source_end_ms: number; source_hash: string; character_version_id: string; original_start: number; original_end: number; source_path: string; composite_start: number; composite_end: number; composite_hash: string; voice_version_id: string; bound_voice: string; bound_provider: string; current_voice: string; current_provider: string }>;
  if (rows.length !== 1) throw Error("3B needs exactly one mapped composite audio segment.");
  const row = rows[0]!;
  if (row.source_hash !== row.composite_hash || row.bound_voice !== row.current_voice || row.bound_provider !== row.current_provider || !existsSync(join(dataDir, "assets", row.source_path))) throw Error("Approved source/voice continuity check failed.");
  if (beat.audio_start_ms !== 2000 || beat.audio_end_ms !== row.source_end_ms - row.source_start_ms) throw Error("3B coverage no longer matches the approved utterance interval.");
  const scale = (row.composite_end - row.composite_start) / (row.original_end - row.original_start);
  const startMs = Math.round((row.source_start_ms + beat.audio_start_ms - row.original_start) * scale);
  const endMs = Math.round((row.source_start_ms + beat.audio_end_ms - row.original_start) * scale);
  if (startMs < 0 || endMs > row.composite_end || endMs <= startMs) throw Error("Composite slice is outside its mapped segment.");
  const faces = await provider.identifyFaces(url);
  if (!faces.some((face) => face.faceId === faceId && face.startTime <= 500 && face.endTime >= beat.audio_end_ms - beat.audio_start_ms)) throw Error("Confirmed Jesus face is not tracked throughout 3B.");
  const result = await provider.syncFace(url, faceId, { path: row.source_path, startMs, endMs }, 0);
  if (!result.media || !existsSync(join(dataDir, "assets", result.media.path))) throw Error("Kling returned no retained lip-sync media.");
  const attemptId = randomUUID();
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at,prompt) VALUES (?,?,?,?,?,'hold_for_review',?,?,?,?)")
      .run(attemptId, SHOT_ID, result.provenance.provider, result.provenance.model, "lip_sync", result.media.path, result.cost.usd, now, `Coverage beat ${BEAT_ID}; base attempt ${base.id}; Kling base task ${BASE_TASK_ID}; visually confirmed Jesus face ${faceId}; approved original source offsets ${row.source_start_ms + beat.audio_start_ms}-${row.source_start_ms + beat.audio_end_ms} ms; composite slice ${startMs}-${endMs} ms; bound visual version ${row.character_version_id}; composite visual version ${row.voice_version_id}; identical ElevenLabs voice ${row.current_voice}.`);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), PROJECT_ID, attemptId, result.cost.usd, now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), PROJECT_ID, SHOT_ID, `Shot 3B face-targeted Kling lip-sync candidate ${attemptId} is held for Dan's review. Use the first ${beat.audio_end_ms - beat.audio_start_ms} ms of the returned video for 3B; no timeline clip was selected. Original source binding and common ElevenLabs Jesus voice were checked without changing the binding.`, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ attemptId, resultAssetPath: result.media.path, baseTaskId: BASE_TASK_ID, faceId, compositeStartMs: startMs, compositeEndMs: endMs }));
}

main().catch((error) => { console.error("FAILED:", error); process.exitCode = 1; });
