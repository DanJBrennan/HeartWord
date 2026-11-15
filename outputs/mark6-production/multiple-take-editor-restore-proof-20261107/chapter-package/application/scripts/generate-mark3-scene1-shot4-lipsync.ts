/** Generate one reviewable Mark 3:4 Jesus lip-sync take from approved coverage. */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingLipSyncProvider } from "../src/providers/kling/index.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const SHOT_ID = "0e456bc8-a7fd-4dd2-877c-32b0b0d661b5";
const BEAT_SEQUENCE = Number(process.argv[2] ?? 1);
if (BEAT_SEQUENCE !== 1 && BEAT_SEQUENCE !== 3) throw new Error("Pass beat 1 or 3.");
const BEAT_ID = BEAT_SEQUENCE === 1
  ? "eda1f4e4-560e-48ae-9288-9c70be49c110"
  : "11be771b-5bdc-4bb5-a45e-bf0e90e85c6f";
const EXPECTED = BEAT_SEQUENCE === 1
  ? { start: 0, end: 6755, compositeStart: 0, compositeEnd: 6744 }
  : { start: 10053, end: 14000, compositeStart: 10037, compositeEnd: 13978 };
const JESUS_ID = "b78bed54-1d53-4b9f-9070-549dddb71b19";

async function main() {
  const db = getDb(), dataDir = getDataDir();
  const existing = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' AND prompt LIKE ?")
    .all(SHOT_ID, `%beat ${BEAT_ID}%`);
  if (existing.length) throw new Error(`Beat ${BEAT_SEQUENCE} already has a lip-sync attempt: ${JSON.stringify(existing)}`);
  const row = db.prepare(`SELECT cb.audio_start_ms,cb.audio_end_ms,cb.status AS beat_status,cb.needs_lip_sync,
      cb.character_id,cb.keyframe_asset_path,ck.status AS keyframe_status,
      ub.source_start_ms,ub.source_end_ms,ub.source_hash,
      original.source_path AS original_path,original.start_ms AS original_start,original.end_ms AS original_end,
      composite.source_path AS composite_path,composite.end_ms AS composite_end,
      map.source_hash AS mapped_hash,map.voice_version_id,
      bound.voice_id AS bound_voice,bound.voice_provider AS bound_provider,
      current.voice_id AS current_voice,current.voice_provider AS current_provider
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
      character_id: string; keyframe_asset_path: string; keyframe_status: string;
      source_start_ms: number; source_end_ms: number; source_hash: string;
      original_path: string; original_start: number; original_end: number;
      composite_path: string; composite_end: number; mapped_hash: string; voice_version_id: string;
      bound_voice: string; bound_provider: string; current_voice: string; current_provider: string;
    }>;
  if (row.length !== 1) throw new Error("Expected exactly one approved source/composite binding.");
  const r = row[0]!;
  if (r.beat_status !== "accepted" || r.keyframe_status !== "accepted" || r.needs_lip_sync !== 1 ||
      r.character_id !== JESUS_ID || r.audio_start_ms !== EXPECTED.start || r.audio_end_ms !== EXPECTED.end ||
      r.source_end_ms-r.source_start_ms !== 14000 || r.composite_end !== 13978) {
    throw new Error("Beat, approved keyframe, or audio interval changed.");
  }
  const sourcePath = join(dataDir, "assets", r.original_path);
  if (!existsSync(sourcePath) || !existsSync(join(dataDir, "assets", r.keyframe_asset_path)) ||
      !existsSync(join(dataDir, "assets", r.composite_path))) throw new Error("Approved input asset missing.");
  const hash = createHash("sha256").update(readFileSync(sourcePath)).digest("hex");
  if (hash !== r.source_hash || r.source_hash !== r.mapped_hash ||
      r.bound_voice !== r.current_voice || r.bound_provider !== r.current_provider) {
    throw new Error("Approved Hatam source or Jesus voice continuity check failed.");
  }
  const scale = r.composite_end / (r.original_end-r.original_start);
  const startMs = Math.round((r.source_start_ms+r.audio_start_ms-r.original_start)*scale);
  const endMs = Math.round((r.source_start_ms+r.audio_end_ms-r.original_start)*scale);
  if (startMs !== EXPECTED.compositeStart || endMs !== EXPECTED.compositeEnd) throw new Error(`Unexpected composite slice ${startMs}-${endMs} ms.`);

  const result = await new KlingLipSyncProvider().sync(
    { characterId: JESUS_ID, characterVersionId: r.voice_version_id },
    { path: r.composite_path, startMs, endMs },
    { path: r.keyframe_asset_path }
  );
  if (!result.media) throw new Error("Kling Avatar returned no video.");
  const mediaPath = join(dataDir, "assets", result.media.path);
  const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", mediaPath], { encoding: "utf8" }).trim())*1000);
  const requiredMs = r.audio_end_ms-r.audio_start_ms;
  const status = durationMs >= requiredMs-50 ? "hold_for_review" : "retry_modified";
  const attemptId = randomUUID(), now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at,prompt) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(attemptId, SHOT_ID, result.provenance.provider, result.provenance.model, "lip_sync", status, result.media.path, result.cost.usd, now,
        `Shot 4 beat ${BEAT_ID} (${BEAT_SEQUENCE === 1 ? "opening" : "closing"}) direct image-to-avatar performance from Dan-approved keyframe; original source ${r.source_start_ms+r.audio_start_ms}-${r.source_start_ms+r.audio_end_ms} ms; composite slice ${startMs}-${endMs} ms; output ${durationMs} ms for required ${requiredMs} ms. Review mouth movement and canon before selection.`);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), PROJECT_ID, attemptId, result.cost.usd, now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), PROJECT_ID, SHOT_ID,
        `Shot 4 ${BEAT_SEQUENCE === 1 ? "opening" : "closing"} beat Avatar candidate ${attemptId} (${durationMs} ms) is ${status}. Dan approved its still. Check Jesus mouth movement, likeness, garment, and duration before selection.`, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ attemptId, resultAssetPath: result.media.path, durationMs, requiredMs, status, compositeStartMs: startMs, compositeEndMs: endMs }));
}

main().catch((error) => { console.error("FAILED:", error); process.exitCode = 1; });
