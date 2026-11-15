/** Generates one producer-approved, single-face Hatam lip-sync candidate.
 * The new Scene 2 Shot 5 is deliberately isolated so Kling's Avatar endpoint
 * cannot animate Jesus or crowd members. The result is held for Dan's review.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingLipSyncProvider } from "../src/providers/kling/index.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const SHOT_ID = "cbe08d3c-9b3e-42f7-a982-9fd072ff1e15";

async function run() {
  const db = getDb();
  const prior = db.prepare("SELECT id,status FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' ORDER BY created_at DESC LIMIT 1").get(SHOT_ID) as { id: string; status: string } | undefined;
  if (prior) {
    console.log(`Lip-sync candidate already exists: ${prior.status}.`);
    return;
  }
  const shot = db.prepare(`
    SELECT sh.dialogue_character_id AS character_id, cv.id AS version_id, ub.source_audio_segment_id, ub.source_start_ms, ub.source_end_ms, ub.source_hash,
      (SELECT result_asset_path FROM generation_attempts WHERE shot_id=sh.id AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1) AS keyframe
    FROM shots sh
    JOIN scenes sc ON sc.id=sh.scene_id
    JOIN shot_utterance_bindings ub ON ub.shot_id=sh.id
    JOIN character_versions cv ON cv.id=ub.character_version_id AND cv.status='approved'
    WHERE sh.id=? AND sc.project_id=? AND sh.needs_lip_sync=1
  `).get(SHOT_ID, PROJECT_ID) as { character_id: string; version_id: string; source_audio_segment_id: string; source_start_ms: number; source_end_ms: number; source_hash: string; keyframe: string | null } | undefined;
  if (!shot?.keyframe) throw new Error("The approved speaking insert or its keyframe is missing.");
  const rows = db.prepare(`
    SELECT a.source_path,a.start_ms,a.end_ms,m.source_hash,m.voice_version_id,o.start_ms AS original_start,o.end_ms AS original_end
    FROM audio_segments a
    JOIN composite_audio_source_map m ON m.composite_segment_id=a.id
    JOIN audio_segments o ON o.id=m.original_segment_id
    WHERE a.project_id=? AND a.layer='composite_cast_master' AND m.original_segment_id=?
  `).all(PROJECT_ID, shot.source_audio_segment_id) as Array<{ source_path: string; start_ms: number; end_ms: number; source_hash: string; voice_version_id: string | null; original_start: number; original_end: number }>;
  if (rows.length !== 1 || rows[0]?.source_hash !== shot.source_hash || rows[0]?.voice_version_id !== shot.version_id) throw new Error("No current composite Hatam source segment matches the producer-approved utterance binding.");
  const composite = rows[0]!;
  const scale = (composite.end_ms - composite.start_ms) / (composite.original_end - composite.original_start);
  const audio = { path: composite.source_path, startMs: Math.round((shot.source_start_ms - composite.original_start) * scale), endMs: Math.round((shot.source_end_ms - composite.original_start) * scale) };
  console.log("Submitting the single-face Hatam lip-sync candidate...");
  const result = await new KlingLipSyncProvider().sync({ characterId: shot.character_id, characterVersionId: shot.version_id }, audio, { path: shot.keyframe });
  if (!result.media) throw new Error("Kling returned no lip-sync media.");
  const now = Date.now(), attemptId = randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,?,'hold_for_review',?,?,?)`).run(attemptId, SHOT_ID, result.provenance.provider, result.provenance.model, "lip_sync", result.media.path, result.cost.usd, now);
    db.prepare(`INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)`).run(randomUUID(), PROJECT_ID, attemptId, result.cost.usd, now);
    db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)`).run(randomUUID(), PROJECT_ID, SHOT_ID, "Single-face Hatam lip-sync candidate returned; producer review is required before selection.", now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ attemptId, path: result.media.path }));
}

run().catch((error) => { console.error("FAILED:", error); process.exit(1); });
