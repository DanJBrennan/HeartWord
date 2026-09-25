/** Source-locked single-face close-ups around the approved Mark 3 ending pause. */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingLipSyncProvider } from "../src/providers/kling/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const frame = "generated/keyframes/mark3-implied-emotion/final-jesus-singleface-v1.png";
const tasks = [
  { shotId: "729dda33-a954-4e5f-8684-c6070609cc8d", startMs: 419245, endMs: 423272 },
  { shotId: "729dda33-a954-4e5f-8684-c6070609cc8d", startMs: 423272, endMs: 427645 },
  { shotId: "9c94aef7-e26f-4acb-a22f-a41a0f926e3f", startMs: 427645, endMs: 429852 }
] as const;
const root = join(getDataDir(), "assets"), db = getDb(), provider = new KlingLipSyncProvider();
if (!existsSync(join(root, frame))) throw new Error("Single-face frame missing.");
for (const task of tasks) {
  const marker = `mark3-final-jesus-closeup-${task.startMs}-${task.endMs}-v1`;
  const prior = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get(task.shotId, `${marker}%`);
  if (prior) { console.log(JSON.stringify({ marker, prior, action: "inspect before retry" })); continue; }
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
    throw new Error(`Approved source binding changed for ${marker}`);
  if (createHash("sha256").update(readFileSync(join(root, row.original_path))).digest("hex") !== row.source_hash)
    throw new Error("Source audio hash changed.");
  const scale = (row.cast_end - row.cast_start) / (row.original_end - row.original_start);
  const castStart = row.cast_start + Math.round((task.startMs - row.original_start) * scale);
  const castEnd = row.cast_start + Math.round((task.endMs - row.original_start) * scale);
  const id = randomUUID();
  db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES (?,?,'pending','pending','lip_sync',?,'hold_for_review',NULL,0,?)`)
    .run(id, task.shotId, `${marker}: source ${task.startMs}-${task.endMs} ms; mapped cast ${castStart}-${castEnd} ms; single-face frame ${frame}; no selection.`, Date.now());
  console.log(JSON.stringify({ marker, id, state: "submitted" }));
  const result = await provider.sync({ characterId: row.dialogue_character_id, characterVersionId: row.voice_version_id },
    { path: row.cast_path, startMs: castStart, endMs: castEnd }, { path: frame });
  if (!result.media?.path) throw new Error(`No retained take for ${marker}`);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE generation_attempts SET provider=?,model=?,result_asset_path=?,cost_usd=? WHERE id=?")
      .run(result.provenance.provider, result.provenance.model, result.media.path, result.cost.usd, id);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), projectId, id, result.cost.usd, Date.now());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ marker, id, path: result.media.path, costUsdEstimate: result.cost.usd }));
}
