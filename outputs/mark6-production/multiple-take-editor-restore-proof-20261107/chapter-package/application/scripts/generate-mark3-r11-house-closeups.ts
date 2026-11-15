/** Source-bound candidate Jesus close-ups sharing one approved-room/costume frame. */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingLipSyncProvider } from "../src/providers/kling/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const frame = "generated/keyframes/mark3-r11-revision/house-jesus-canon-close-v1.png";
const tasks = [
  { shotId: "da0b28bc-4093-4bbb-b32b-5a485d469f46", startMs: 322023, endMs: 330023 },
  { shotId: "4cc7c4fe-82e0-42bf-87f9-5fba04ae5ec3", startMs: 336093, endMs: 344093 },
  { shotId: "4cc7c4fe-82e0-42bf-87f9-5fba04ae5ec3", startMs: 344093, endMs: 352093 },
  { shotId: "4cc7c4fe-82e0-42bf-87f9-5fba04ae5ec3", startMs: 352093, endMs: 357079 },
  { shotId: "b5371a81-6a61-4377-8704-7733c7f131b5", startMs: 357645, endMs: 364645 }
] as const;
const root = join(getDataDir(), "assets"), db = getDb(), provider = new KlingLipSyncProvider();
if (!existsSync(join(root, frame))) throw new Error("House close-up keyframe missing.");
for (const task of tasks) {
  const marker = `mark3-r11-house-closeup-${task.startMs}-${task.endMs}-v1`;
  const prior = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get(task.shotId, `${marker}%`) as { id: string; status: string; result_asset_path: string | null } | undefined;
  if (prior) {
    if (!prior.result_asset_path || !existsSync(join(root, prior.result_asset_path))) throw new Error(`Incomplete prior candidate: ${marker}`);
    console.log(JSON.stringify({ marker, prior, action: "reusing retained candidate" })); continue;
  }
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
    throw new Error(`Source binding changed: ${marker}`);
  if (createHash("sha256").update(readFileSync(join(root, row.original_path))).digest("hex") !== row.source_hash)
    throw new Error(`Source recording changed: ${marker}`);
  const scale = (row.cast_end - row.cast_start) / (row.original_end - row.original_start);
  const castStart = row.cast_start + Math.round((task.startMs - row.original_start) * scale);
  const castEnd = row.cast_start + Math.round((task.endMs - row.original_start) * scale);
  const id = randomUUID();
  db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES (?,?,'pending','pending','lip_sync',?,'hold_for_review',NULL,0,?)`)
    .run(id, task.shotId, `${marker}: verified source ${task.startMs}-${task.endMs}ms; mapped cast ${castStart}-${castEnd}ms; consistent house, single face and approved v5 mantle ${frame}; no selection.`, Date.now());
  console.log(JSON.stringify({ marker, id, state: "submitted" }));
  const result = await provider.sync({ characterId: row.dialogue_character_id, characterVersionId: row.voice_version_id },
    { path: row.cast_path, startMs: castStart, endMs: castEnd }, { path: frame });
  if (!result.media?.path) throw new Error(`No take: ${marker}`);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE generation_attempts SET provider=?,model=?,result_asset_path=?,cost_usd=? WHERE id=?")
      .run(result.provenance.provider, result.provenance.model, result.media.path, result.cost.usd, id);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), projectId, id, result.cost.usd, Date.now());
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), projectId, task.shotId, `${marker}: verify only Jesus mouths the source-bound line, Papuan likeness, approved cream mantle and same-house background before selection.`, Date.now());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ marker, path: result.media.path, costUsdEstimate: result.cost.usd }));
}
