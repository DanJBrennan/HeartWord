/** Retain the completed short 3B base and prepare a full-length base for face lip-sync. */
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
const SHORT_TASK_ID = "931849384533950479";
const SHORT_TASK_CREATED_AT = 1790198725215;
const ESTIMATED_KLING_BASE_USD = 0.6; // Existing Kling adapter estimate; not invoice reconciled.

const db = getDb();
const dataDir = getDataDir();
const videoDir = join(dataDir, "assets", "generated", "video");

function durationMs(path: string): number {
  return Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], { encoding: "utf8" }).trim()) * 1000);
}

function recordBase(taskId: string, relativePath: string, status: "hold_for_review" | "retry_modified", note: string, createdAt = Date.now()): string {
  const existing = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_coverage_base' AND result_asset_path=?").get(SHOT_ID, relativePath) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at,prompt) VALUES (?,?,'kling','kling-v2-6-pro','generate_coverage_base',?,?,?,?,?)")
      .run(id, SHOT_ID, status, relativePath, ESTIMATED_KLING_BASE_USD, createdAt, `Coverage beat ${BEAT_ID}; Kling task ${taskId}. ${note}`);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), PROJECT_ID, id, ESTIMATED_KLING_BASE_USD, createdAt);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), PROJECT_ID, SHOT_ID, `Shot 3B base ${taskId}: ${note}`, Date.now());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return id;
}

async function main() {
  const beat = db.prepare("SELECT cb.*, ck.status AS keyframe_status FROM coverage_beats cb JOIN coverage_keyframe_attempts ck ON ck.coverage_beat_id=cb.id AND ck.result_asset_path=cb.keyframe_asset_path WHERE cb.id=? AND cb.shot_id=?")
    .get(BEAT_ID, SHOT_ID) as { status: string; keyframe_status: string; keyframe_asset_path: string; audio_start_ms: number; audio_end_ms: number; needs_lip_sync: number } | undefined;
  if (!beat || beat.status !== "accepted" || beat.keyframe_status !== "accepted" || beat.needs_lip_sync !== 1) throw Error("3B coverage and keyframe must be accepted.");
  const requiredMs = beat.audio_end_ms - beat.audio_start_ms;
  const voice = db.prepare(`SELECT bound.voice_id AS bound_voice, current.voice_id AS current_voice,
      bound.voice_provider AS bound_provider, current.voice_provider AS current_provider,
      ub.source_hash, m.source_hash AS composite_hash
      FROM shot_utterance_bindings ub
      JOIN character_versions bound ON bound.id=ub.character_version_id
      JOIN character_versions current ON current.character_id=bound.character_id AND current.status='approved'
      JOIN composite_audio_source_map m ON m.original_segment_id=ub.source_audio_segment_id
      JOIN audio_segments a ON a.id=m.composite_segment_id AND a.project_id=? AND a.layer='composite_cast_master'
      WHERE ub.shot_id=? AND m.voice_version_id=current.id`)
    .get(PROJECT_ID, SHOT_ID) as { bound_voice: string; current_voice: string; bound_provider: string; current_provider: string; source_hash: string; composite_hash: string } | undefined;
  if (!voice || voice.bound_voice !== voice.current_voice || voice.bound_provider !== voice.current_provider || voice.source_hash !== voice.composite_hash) throw Error("3B approved source and voice continuity check failed.");
  const shortRel = join("generated", "video", `mark3-scene1-shot3b-base-${SHORT_TASK_ID}.mp4`);
  const shortPath = join(dataDir, "assets", shortRel);
  if (!existsSync(shortPath)) throw Error("Completed 3B Kling base was not recovered.");
  const shortMs = durationMs(shortPath);
  if (shortMs >= requiredMs) throw Error("Short base already covers the beat; review before purchasing another.");
  const prior = db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_coverage_base' AND status='hold_for_review' ORDER BY created_at DESC LIMIT 1").get(SHOT_ID) as { id: string; result_asset_path: string } | undefined;
  recordBase(SHORT_TASK_ID, shortRel, "retry_modified", `Recovered completed take (${shortMs} ms); too short for the approved ${requiredMs} ms 3B interval. Retained for comparison.`, SHORT_TASK_CREATED_AT);
  if (prior) {
    console.log(JSON.stringify({ retainedShortBase: shortRel, fullBaseAlreadyRecorded: prior }));
    return;
  }
  const prompt = "Locked eye-level close shot from the Man with Withered Hand's perspective inside the established synagogue. Canonical Jesus faces him, maintaining the approved Papuan face, cream tunic and mantle with indigo bands, established warm readable light and softly visible synagogue. Natural subtle breathing, small eye and head movements, mouth resting neutrally for later audio-driven lip sync. No invented speech, no other visible speaking face, no scene or wardrobe change. Camera stays steady.";
  const provider = new KlingFaceLipSyncProvider();
  const { taskId, videoUrl } = await provider.generateSceneVideo({ path: beat.keyframe_asset_path }, prompt, 10);
  const response = await fetch(videoUrl);
  if (!response.ok) throw Error(`Kling base ${taskId} download failed: ${response.status}`);
  const rel = join("generated", "video", `mark3-scene1-shot3b-base-${taskId}.mp4`);
  const path = join(dataDir, "assets", rel);
  mkdirSync(videoDir, { recursive: true });
  writeFileSync(path, Buffer.from(await response.arrayBuffer()), { flag: "wx" });
  const actualMs = durationMs(path);
  const status = actualMs >= requiredMs ? "hold_for_review" : "retry_modified";
  const attemptId = recordBase(taskId, rel, status, `10-second request from approved 3B keyframe; actual ${actualMs} ms for approved ${requiredMs} ms interval. Bound and current Jesus versions share ElevenLabs voice ${voice.current_voice}.`);
  console.log(JSON.stringify({ taskId, attemptId, relativePath: rel, actualMs, requiredMs, status }));
}

main().catch((error) => { console.error("FAILED:", error); process.exitCode = 1; });
