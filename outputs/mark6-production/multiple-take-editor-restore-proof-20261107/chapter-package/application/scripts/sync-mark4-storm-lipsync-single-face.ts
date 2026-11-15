/** Submit the producer-confirmed Mark 4 storm faces to Kling lip-sync.
 * Face choice is either unique or explicitly confirmed by Dan. Results are
 * held for producer review and never create timeline clips.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const takes = [
  ["Peter plea", "6db6f5f1-ced4-4675-82f4-05c772333d01", "932970054562480150", "0", "Dan confirmed Candidate 1"],
  ["Jesus command", "c02b7bd2-d16d-4163-b7a0-88f32ae3e1dd", "932971043504521293", "0", "only detected candidate"],
  ["Jesus question, first beat", "89ba4fb7-5e0a-4049-b4f2-6ec9fc778d64", "932971876605886552", "0", "only detected candidate"],
  ["Jesus question, second beat", "404d00a7-a0c5-4d64-ae50-281e60f93302", "932972668193341519", "0", "Dan confirmed Candidate 1"]
] as const;
const db = getDb(), dataDir = getDataDir();

async function baseUrl(taskId: string): Promise<string> {
  const key = process.env.KLING_API_KEY_1; if (!key) throw Error("Kling API key is unavailable.");
  const response = await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${taskId}`, { headers: { Authorization: `Bearer ${key}` } });
  const task = await response.json() as { code: number; data?: { task_status?: string; task_result?: { videos?: Array<{ url?: string }> } } };
  const url = task.data?.task_result?.videos?.[0]?.url;
  if (!response.ok || task.code !== 0 || task.data?.task_status !== "succeed" || !url) throw Error(`Retained base ${taskId} is unavailable.`);
  return url;
}

async function main() {
  const provider = new KlingFaceLipSyncProvider(), output = [];
  for (const [label, shotId, taskId, confirmedFaceId, confirmation] of takes) {
    const prior = db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' ORDER BY created_at DESC LIMIT 1").get(shotId) as { id: string; result_asset_path: string } | undefined;
    if (prior && existsSync(join(dataDir, "assets", prior.result_asset_path))) { output.push({ label, reused: true, attemptId: prior.id }); continue; }
    const row = db.prepare(`SELECT ub.source_start_ms,ub.source_end_ms,ub.source_hash,
      original.start_ms AS original_start,original.end_ms AS original_end,
      composite.source_path,composite.start_ms AS composite_start,composite.end_ms AS composite_end,
      map.source_hash AS composite_hash
      FROM shot_utterance_bindings ub
      JOIN audio_segments original ON original.id=ub.source_audio_segment_id
      JOIN composite_audio_source_map map ON map.original_segment_id=original.id
      JOIN audio_segments composite ON composite.id=map.composite_segment_id AND composite.project_id=? AND composite.layer='composite_cast_master'
      WHERE ub.shot_id=?`).get(projectId, shotId) as { source_start_ms: number; source_end_ms: number; source_hash: string; original_start: number; original_end: number; source_path: string; composite_start: number; composite_end: number; composite_hash: string } | undefined;
    if (!row || row.source_hash !== row.composite_hash || !existsSync(join(dataDir, "assets", row.source_path))) throw Error(`${label} source-to-composite continuity check failed.`);
    const base = await baseUrl(taskId), faces = await provider.identifyFaces(base);
    const confirmedFace = faces.find((face) => face.faceId === confirmedFaceId);
    if (!confirmedFace || confirmedFace.startTime > 0 || confirmedFace.endTime < row.source_end_ms - row.source_start_ms) throw Error(`${label} confirmed face is unavailable for the full source interval.`);
    const scale = (row.composite_end - row.composite_start) / (row.original_end - row.original_start);
    const startMs = Math.round((row.source_start_ms - row.original_start) * scale);
    const endMs = Math.round((row.source_end_ms - row.original_start) * scale);
    if (startMs < 0 || endMs <= startMs || endMs > row.composite_end) throw Error(`${label} composite slice is invalid.`);
    const result = await provider.syncFace(base, confirmedFace.faceId, { path: row.source_path, startMs, endMs });
    if (!result.media || !existsSync(join(dataDir, "assets", result.media.path))) throw Error(`${label} lip-sync file was not retained.`);
    const id = randomUUID(), now = Date.now();
    db.exec("BEGIN IMMEDIATE"); try {
      db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,? ,?,'hold_for_review',?,?,?)")
        .run(id, shotId, result.provenance.provider, result.provenance.model, "lip_sync", `${label}; ${confirmation}; confirmed face is tracked for the full retained base ${taskId}; exact composite source slice ${startMs}-${endMs} ms.`, result.media.path, result.cost.usd, now);
      db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)").run(randomUUID(), projectId, id, result.cost.usd, now);
      db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)").run(randomUUID(), projectId, shotId, `${label} source-bound face-targeted lip-sync candidate is held for Dan’s review; no timeline clip was selected.`, now);
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    output.push({ label, attemptId: id, path: result.media.path, sourceSliceMs: [startMs, endMs] });
  }
  console.log(JSON.stringify(output, null, 2));
}
main().catch((error) => { console.error("FAILED:", error); process.exitCode = 1; });
