/** Source-locked alternate speaking angles from producer-approved keyframes. */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingLipSyncProvider } from "../src/providers/kling/index.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const tasks = [
  { name: "scene5-spokesperson-closeup", scene: 5, shot: 5, start: 399191, end: 406000, frame: "scene5-spokesperson-closeup-candidate.png" }
] as const;
const requested = process.argv[2];
if (requested && !tasks.some(task => task.name === requested)) throw new Error(`Unknown lip-sync task ${requested}`);
const db = getDb(), root = join(getDataDir(), "assets"), provider = new KlingLipSyncProvider();
for (const task of tasks.filter(task => !requested || task.name === requested)) {
  const marker = `mark3-r7-${task.name}-approved-frame-v1`;
  const row = db.prepare(`SELECT sh.id AS shot_id,sh.dialogue_character_id,ub.source_start_ms,ub.source_end_ms,ub.source_hash,
      o.source_path AS original_path,o.start_ms AS original_start,o.end_ms AS original_end,
      m.source_hash AS mapped_hash,m.voice_version_id,a.source_path AS cast_path,
      a.start_ms AS cast_start,a.end_ms AS cast_end
    FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
    JOIN shot_utterance_bindings ub ON ub.shot_id=sh.id
    JOIN audio_segments o ON o.id=ub.source_audio_segment_id
    JOIN composite_audio_source_map m ON m.original_segment_id=o.id
    JOIN audio_segments a ON a.id=m.composite_segment_id AND a.layer='composite_cast_master'
    WHERE sc.project_id=? AND sc.sequence=? AND sh.sequence=? AND sh.needs_lip_sync=1`)
    .get(projectId, task.scene, task.shot) as {
      shot_id: string; dialogue_character_id: string; source_start_ms: number; source_end_ms: number; source_hash: string;
      original_path: string; original_start: number; original_end: number; mapped_hash: string;
      voice_version_id: string; cast_path: string; cast_start: number; cast_end: number;
    } | undefined;
  if (!row || row.source_hash !== row.mapped_hash || task.start < row.source_start_ms || task.end > row.source_end_ms)
    throw new Error(`Source binding mismatch for ${marker}: ${JSON.stringify(row && { start: row.source_start_ms, end: row.source_end_ms, originalStart: row.original_start, originalEnd: row.original_end, hashMatches: row.source_hash === row.mapped_hash })}`);
  const prior = db.prepare("SELECT id,status,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get(row.shot_id, `${marker}%`);
  if (prior) { console.log(JSON.stringify({ name: task.name, reused: prior })); continue; }
  const frame = `generated/keyframes/mark3-r7-editorial/${task.frame}`;
  for (const path of [frame, row.original_path, row.cast_path]) if (!existsSync(join(root, path))) throw new Error(`Missing approved input ${path}`);
  if (createHash("sha256").update(readFileSync(join(root, row.original_path))).digest("hex") !== row.source_hash)
    throw new Error(`Original source hash changed for ${marker}`);
  const scale = (row.cast_end - row.cast_start) / (row.original_end - row.original_start);
  const castStart = row.cast_start + Math.round((task.start - row.original_start) * scale);
  const castEnd = row.cast_start + Math.round((task.end - row.original_start) * scale);
  const result = await provider.sync(
    { characterId: row.dialogue_character_id, characterVersionId: row.voice_version_id },
    { path: row.cast_path, startMs: castStart, endMs: castEnd }, { path: frame }
  );
  if (!result.media?.path) throw new Error(`No retained take for ${marker}`);
  const id = randomUUID(), now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)
      VALUES (?,?,?,?,?,?,'hold_for_review',?,?,?)`)
      .run(id, row.shot_id, result.provenance.provider, result.provenance.model, "lip_sync",
        `${marker}: approved source ${task.start}-${task.end} ms; mapped cast ${castStart}-${castEnd} ms; producer-approved frame ${frame}; no selection.`, result.media.path, result.cost.usd, now);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
      .run(randomUUID(), projectId, id, result.cost.usd, now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(), projectId, row.shot_id, `${marker}: inspect correct single speaking face, canon, timing, and any unintended mouth movement before selection.`, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ name: task.name, id, path: result.media.path, costUsd: result.cost.usd }));
}
