/** Alternate 3B take: animate the approved single-face keyframe directly from Hatam audio. */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingLipSyncProvider } from "../src/providers/kling/index.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const SHOT_ID = "b3d64f2d-90ff-4b6c-8cda-dd98391a0d50";
const BEAT_ID = "fe4b14c2-d85c-4991-a726-1cc2da8ce2ff";
const PRIOR_ATTEMPT_ID = "c672f203-b174-4aad-b1a8-38f80b4018d2";

async function main() {
  const db = getDb();
  const dataDir = getDataDir();
  const prior = db.prepare("SELECT status FROM generation_attempts WHERE id=? AND shot_id=? AND operation='lip_sync'").get(PRIOR_ATTEMPT_ID, SHOT_ID) as { status: string } | undefined;
  if (!prior || prior.status !== "hold_for_review") throw Error("The weak 3B take is no longer held; inspect current review state.");
  const other = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' AND id<>? ORDER BY created_at DESC LIMIT 1").get(SHOT_ID, PRIOR_ATTEMPT_ID);
  if (other) throw Error("Another 3B lip-sync take exists; refusing duplicate paid generation.");
  const rows = db.prepare(`SELECT cb.audio_start_ms,cb.audio_end_ms,cb.status AS beat_status,cb.needs_lip_sync,
      cb.keyframe_asset_path,ck.status AS keyframe_status,
      ub.source_start_ms,ub.source_end_ms,ub.source_hash,
      original.source_path AS original_path,original.start_ms AS original_start,original.end_ms AS original_end,
      composite.source_path AS composite_path,composite.end_ms AS composite_end,
      map.source_hash AS composite_hash,map.voice_version_id,
      bound.voice_id AS bound_voice,bound.voice_provider AS bound_provider,
      current.voice_id AS current_voice,current.voice_provider AS current_provider,
      bound.character_id
    FROM coverage_beats cb
    JOIN coverage_keyframe_attempts ck ON ck.coverage_beat_id=cb.id AND ck.result_asset_path=cb.keyframe_asset_path
    JOIN shot_utterance_bindings ub ON ub.shot_id=cb.shot_id
    JOIN audio_segments original ON original.id=ub.source_audio_segment_id
    JOIN composite_audio_source_map map ON map.original_segment_id=original.id
    JOIN audio_segments composite ON composite.id=map.composite_segment_id AND composite.project_id=? AND composite.layer='composite_cast_master'
    JOIN character_versions bound ON bound.id=ub.character_version_id
    JOIN character_versions current ON current.id=map.voice_version_id AND current.character_id=bound.character_id AND current.status='approved'
    WHERE cb.id=? AND cb.shot_id=?`).all(PROJECT_ID, BEAT_ID, SHOT_ID) as Array<{
      audio_start_ms: number; audio_end_ms: number; beat_status: string; needs_lip_sync: number;
      keyframe_asset_path: string; keyframe_status: string; source_start_ms: number; source_end_ms: number;
      source_hash: string; original_path: string; original_start: number; original_end: number;
      composite_path: string; composite_end: number; composite_hash: string; voice_version_id: string;
      bound_voice: string; bound_provider: string; current_voice: string; current_provider: string; character_id: string;
    }>;
  if (rows.length !== 1) throw Error("3B needs exactly one approved source and composite segment.");
  const row = rows[0]!;
  if (row.beat_status !== "accepted" || row.keyframe_status !== "accepted" || row.needs_lip_sync !== 1 || row.audio_start_ms !== 2000 || row.audio_end_ms !== row.source_end_ms - row.source_start_ms) throw Error("3B approval or interval has changed.");
  const originalPath = join(dataDir, "assets", row.original_path);
  if (!existsSync(originalPath) || !existsSync(join(dataDir, "assets", row.keyframe_asset_path)) || !existsSync(join(dataDir, "assets", row.composite_path))) throw Error("Approved input asset is missing.");
  const actualHash = createHash("sha256").update(readFileSync(originalPath)).digest("hex");
  if (actualHash !== row.source_hash || row.source_hash !== row.composite_hash || row.bound_voice !== row.current_voice || row.bound_provider !== row.current_provider) throw Error("Approved Hatam source/voice continuity check failed.");
  const scale = row.composite_end / (row.original_end - row.original_start);
  const startMs = Math.round((row.source_start_ms + row.audio_start_ms - row.original_start) * scale);
  const endMs = Math.round((row.source_start_ms + row.audio_end_ms - row.original_start) * scale);
  if (startMs < 0 || endMs > row.composite_end || endMs <= startMs) throw Error("Composite audio slice is invalid.");
  const result = await new KlingLipSyncProvider().sync(
    { characterId: row.character_id, characterVersionId: row.voice_version_id },
    { path: row.composite_path, startMs, endMs },
    { path: row.keyframe_asset_path }
  );
  if (!result.media) throw Error("Kling Avatar returned no video.");
  const mediaPath = join(dataDir, "assets", result.media.path);
  const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", mediaPath], { encoding: "utf8" }).trim()) * 1000);
  const requiredMs = row.audio_end_ms - row.audio_start_ms;
  const newStatus = durationMs >= requiredMs - 50 ? "hold_for_review" : "retry_modified";
  const now = Date.now(), attemptId = randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE generation_attempts SET status='retry_modified' WHERE id=? AND status='hold_for_review'").run(PRIOR_ATTEMPT_ID);
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at,prompt) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(attemptId, SHOT_ID, result.provenance.provider, result.provenance.model, "lip_sync", newStatus, result.media.path, result.cost.usd, now,
        `Shot 3B alternate direct image-to-avatar performance from accepted keyframe; approved original source ${row.source_start_ms + row.audio_start_ms}-${row.source_start_ms + row.audio_end_ms} ms, composite slice ${startMs}-${endMs} ms; previous face-targeted take ${PRIOR_ATTEMPT_ID} rejected for weak mouth opening. Output ${durationMs} ms; use first ${requiredMs} ms for 3B.`);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), PROJECT_ID, attemptId, result.cost.usd, now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'human',?,1,?)")
      .run(randomUUID(), PROJECT_ID, SHOT_ID, `Dan found face-targeted lip-sync take ${PRIOR_ATTEMPT_ID} too weak: Jesus opened his mouth only a small amount. Retained as revision history.`, now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), PROJECT_ID, SHOT_ID, `Alternate direct Avatar 3B candidate ${attemptId} (${durationMs} ms) is ${newStatus}; producer review required. Original Hatam binding, voice, and approved keyframe were preserved.`, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ attemptId, resultAssetPath: result.media.path, durationMs, requiredMs, status: newStatus, compositeStartMs: startMs, compositeEndMs: endMs }));
}

main().catch((error) => { console.error("FAILED:", error); process.exitCode = 1; });
