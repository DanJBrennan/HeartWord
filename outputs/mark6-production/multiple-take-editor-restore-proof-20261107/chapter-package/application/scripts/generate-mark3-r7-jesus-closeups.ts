/** Two source-locked replacement takes for Scene 4's wrong-speaker coverage. */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingLipSyncProvider } from "../src/providers/kling/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const root = join(getDataDir(), "assets"), db = getDb();
// Dan approved this single-face replacement after the first pair animated
// background listeners' mouths. The rejected takes remain in attempt history.
const keyframe = "generated/keyframes/mark3-r7-editorial/scene4-jesus-singleface-candidate.png";
const tasks = [
  { shotId: "da0b28bc-4093-4bbb-b32b-5a485d469f46", startMs: 322023, endMs: 330023 },
  { shotId: "4cc7c4fe-82e0-42bf-87f9-5fba04ae5ec3", startMs: 344093, endMs: 352093 }
] as const;
if (!existsSync(join(root, keyframe))) throw new Error("The reviewed-frame crop is missing.");

for (const task of tasks) {
  const marker = `mark3-r7-jesus-closeup-${task.startMs}-${task.endMs}-singleface-v2`;
  const prior = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get(task.shotId, `${marker}%`);
  if (prior) { console.log(JSON.stringify({ marker, reused: prior })); continue; }
  const row = db.prepare(`SELECT sh.dialogue_character_id,ub.source_start_ms,ub.source_end_ms,ub.source_hash,
      o.source_path AS original_path,o.start_ms AS original_start,o.end_ms AS original_end,
      m.source_hash AS mapped_hash,m.voice_version_id,a.source_path AS cast_path,
      a.start_ms AS cast_start,a.end_ms AS cast_end
    FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
    JOIN shot_utterance_bindings ub ON ub.shot_id=sh.id
    JOIN audio_segments o ON o.id=ub.source_audio_segment_id
    JOIN composite_audio_source_map m ON m.original_segment_id=o.id
    JOIN audio_segments a ON a.id=m.composite_segment_id AND a.layer='composite_cast_master'
    WHERE sh.id=? AND sc.project_id=? AND sh.needs_lip_sync=1`).get(task.shotId, projectId) as {
      dialogue_character_id: string; source_start_ms: number; source_end_ms: number; source_hash: string;
      original_path: string; original_start: number; original_end: number; mapped_hash: string;
      voice_version_id: string; cast_path: string; cast_start: number; cast_end: number;
    } | undefined;
  if (!row || row.source_hash !== row.mapped_hash || task.startMs < row.source_start_ms || task.endMs > row.source_end_ms)
    throw new Error(`The approved source binding changed for ${marker}.`);
  if (createHash("sha256").update(readFileSync(join(root, row.original_path))).digest("hex") !== row.source_hash)
    throw new Error("The approved source recording changed.");
  const scale = (row.cast_end - row.cast_start) / (row.original_end - row.original_start);
  const castStart = row.cast_start + Math.round((task.startMs - row.original_start) * scale);
  const castEnd = row.cast_start + Math.round((task.endMs - row.original_start) * scale);
  const result = await new KlingLipSyncProvider().sync(
    { characterId: row.dialogue_character_id, characterVersionId: row.voice_version_id },
    { path: row.cast_path, startMs: castStart, endMs: castEnd }, { path: keyframe }
  );
  if (!result.media?.path) throw new Error(`No retained take for ${marker}.`);
  const id = randomUUID(), now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)
      VALUES (?,?,?,?,? ,?,'hold_for_review',?,?,?)`).run(id, task.shotId, result.provenance.provider,
        result.provenance.model, "lip_sync", `${marker}: approved source ${task.startMs}-${task.endMs} ms; mapped cast ${castStart}-${castEnd} ms; producer-approved single-face keyframe ${keyframe}; no selection.`, result.media.path, result.cost.usd, now);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), projectId, id, result.cost.usd, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ marker, id, path: result.media.path, costUsd: result.cost.usd }));
}
