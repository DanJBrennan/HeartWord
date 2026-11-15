/**
 * Apply the exact, scoped source speech to the visually confirmed Jesus face
 * in each of the seven held Mark 4 short-performance bases.  This stays
 * review-only: no timeline selection or chapter-wide work is performed.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

type Item = { key: string; shotId: string; label: string; sourceId: string; startMs: number; endMs: number };
type Pending = { key: string; taskId: string };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir();
const db = getDb();
const manifest = JSON.parse(readFileSync(join(dataDir, "assets", "generated", "pilot-source", "mark4-short-jesus-batch.json"), "utf8")) as { items: Item[] };
if (manifest.items.length !== 7) throw Error("The short-Jesus batch must contain exactly seven approved items.");
const pendingPath = join(dataDir, "assets", "generated", "pilot-source", "mark4-short-jesus-lipsync-pending.json");
const pending: Pending[] = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, "utf8")) : [];
const save = () => writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
const provider = new KlingFaceLipSyncProvider();

for (const item of manifest.items) {
  const prior = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='lip_sync'
    AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1`).get(item.shotId, `Mark 4 short-Jesus batch ${item.key}%`) as { result_asset_path: string } | undefined;
  if (prior && existsSync(join(dataDir, "assets", prior.result_asset_path))) {
    console.log(`${item.key}: reusing ${prior.result_asset_path}`);
    continue;
  }
  if (pending.some(entry => entry.key === item.key)) throw Error(`${item.label} has a durable lip-sync task awaiting recovery; do not submit a duplicate.`);
  const base = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_short_jesus_base'
    AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1`).get(item.shotId, `Mark 4 short-Jesus batch ${item.key}%`) as { result_asset_path: string } | undefined;
  const taskId = base?.result_asset_path.match(/-(\d+)\.mp4$/)?.[1];
  if (!taskId) throw Error(`The held base task for ${item.label} is unavailable.`);
  const baseResponse = await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${taskId}`, { headers: { Authorization: `Bearer ${process.env.KLING_API_KEY_1}` } });
  const baseTask = await baseResponse.json() as { code: number; data?: { task_status?: string; task_result?: { videos?: Array<{ url?: string }> } } };
  const baseUrl = baseTask.data?.task_result?.videos?.[0]?.url;
  if (!baseResponse.ok || baseTask.code !== 0 || baseTask.data?.task_status !== "succeed" || !baseUrl) throw Error(`The held base video for ${item.label} is not recoverable.`);
  const audio = db.prepare(`SELECT original.start_ms original_start, original.end_ms original_end, composite.source_path,
      composite.start_ms composite_start, composite.end_ms composite_end, map.source_hash, ub.source_hash binding_hash
    FROM shot_utterance_bindings ub
    JOIN audio_segments original ON original.id=ub.source_audio_segment_id
    JOIN composite_audio_source_map map ON map.original_segment_id=original.id
    JOIN audio_segments composite ON composite.id=map.composite_segment_id AND composite.layer='composite_cast_master'
    WHERE ub.shot_id=? AND ub.source_audio_segment_id=?`).get(item.shotId, item.sourceId) as {
      original_start: number; original_end: number; source_path: string; composite_start: number; composite_end: number; source_hash: string; binding_hash: string;
    } | undefined;
  if (!audio || audio.source_hash !== audio.binding_hash || !existsSync(join(dataDir, "assets", audio.source_path))) throw Error(`The approved audio binding for ${item.label} is unavailable.`);
  const scale = (audio.composite_end - audio.composite_start) / (audio.original_end - audio.original_start);
  const sourceDurationMs = item.endMs - item.startMs;
  const endMs = Math.round(sourceDurationMs * scale);
  let submittedTaskId = "";
  const result = await provider.syncFace(baseUrl, "0", { path: audio.source_path, startMs: 0, endMs }, 0, async submitted => {
    submittedTaskId = submitted;
    pending.push({ key: item.key, taskId: submitted }); save();
  });
  if (!result.media || !existsSync(join(dataDir, "assets", result.media.path))) throw Error(`Lip-sync output for ${item.label} was not retained.`);
  const id = randomUUID(); const now = Date.now();
  const prompt = `Mark 4 short-Jesus batch ${item.key}: ${item.label}; visually confirmed Jesus Candidate 1 (provider face 0); exact source interval ${item.startMs}-${item.endMs} ms; composite source slice 0-${endMs} ms.`;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)
      VALUES (?,?,?,?,? ,?,'hold_for_review',?,?,?)`).run(id, item.shotId, result.provenance.provider, result.provenance.model, "lip_sync", prompt, result.media.path, result.cost.usd, now);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)").run(randomUUID(), projectId, id, result.cost.usd, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  pending.splice(pending.findIndex(entry => entry.key === item.key && entry.taskId === submittedTaskId), 1); save();
  console.log(`${item.key}: ${result.media.path}`);
}
