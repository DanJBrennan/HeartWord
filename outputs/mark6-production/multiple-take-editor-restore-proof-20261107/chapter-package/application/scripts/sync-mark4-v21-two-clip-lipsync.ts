/** Apply exact source audio to the verified Jesus face in Mark 4:21's
 * second, held pilot clip. This is review-only and never selects a timeline. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const shotId = "611a8078-e67e-47c3-9cff-8c920809798e";
const originalId = "f13972b1-1558-466c-abd8-68cc4a083d37";
const baseTaskId = "933007854700331011";
const sourceStart = 3680;
const sourceEnd = 8396;
const dataDir = getDataDir();
const db = getDb();
const key = process.env.KLING_API_KEY_1;
if (!key) throw Error("Kling key is unavailable.");
const pendingPath = join(dataDir, "assets", "generated", "pilot-source", "mark4-v21-two-clip-lipsync-pending.json");
const pending = existsSync(pendingPath)
  ? JSON.parse(readFileSync(pendingPath, "utf8")) as Array<{ taskId: string }>
  : [];
const save = () => writeFileSync(pendingPath, JSON.stringify(pending, null, 2));

const audio = db.prepare(`SELECT original.start_ms original_start, original.end_ms original_end,
  composite.source_path, composite.start_ms composite_start, composite.end_ms composite_end,
  map.source_hash, ub.source_hash binding_hash
  FROM shot_utterance_bindings ub
  JOIN audio_segments original ON original.id=ub.source_audio_segment_id
  JOIN composite_audio_source_map map ON map.original_segment_id=original.id
  JOIN audio_segments composite ON composite.id=map.composite_segment_id AND composite.layer='composite_cast_master'
  WHERE ub.shot_id=? AND ub.source_audio_segment_id=?`).get(shotId, originalId) as {
    original_start: number; original_end: number; source_path: string;
    composite_start: number; composite_end: number; source_hash: string; binding_hash: string;
  } | undefined;
if (!audio || audio.source_hash !== audio.binding_hash || !existsSync(join(dataDir, "assets", audio.source_path))) {
  throw Error("The approved Mark 4:21 composite source binding is unavailable.");
}
const prior = db.prepare(`SELECT result_asset_path FROM generation_attempts
  WHERE shot_id=? AND operation='lip_sync' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1`)
  .get(shotId, "Mark 4:21 two-clip pilot segment 2%") as { result_asset_path: string } | undefined;
if (prior && existsSync(join(dataDir, "assets", prior.result_asset_path))) {
  console.log(JSON.stringify({ reused: true, path: prior.result_asset_path }, null, 2));
  process.exit(0);
}
if (pending.length) throw Error("A durable Mark 4:21 lip-sync task is awaiting recovery; do not submit a duplicate.");

const taskResponse = await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${baseTaskId}`, {
  headers: { Authorization: `Bearer ${key}` },
});
const task = await taskResponse.json() as { code: number; data?: { task_status?: string; task_result?: { videos?: Array<{ url?: string }> } } };
const baseUrl = task.data?.task_result?.videos?.[0]?.url;
if (!taskResponse.ok || task.code !== 0 || task.data?.task_status !== "succeed" || !baseUrl) throw Error("The held Mark 4:21 Jesus base clip is unavailable.");

const scale = (audio.composite_end - audio.composite_start) / (audio.original_end - audio.original_start);
const startMs = Math.round(sourceStart * scale);
const endMs = Math.round(sourceEnd * scale);
const provider = new KlingFaceLipSyncProvider();
const result = await provider.syncFace(baseUrl, "0", { path: audio.source_path, startMs, endMs }, 0,
  async taskId => { pending.push({ taskId }); save(); });
if (!result.media || !existsSync(join(dataDir, "assets", result.media.path))) throw Error("The Mark 4:21 lip-sync output was not retained.");

const id = randomUUID();
const now = Date.now();
const prompt = `Mark 4:21 two-clip pilot segment 2: Jesus insert; visually confirmed Jesus Candidate 1 (provider face 0); exact original source offset ${sourceStart}-${sourceEnd} ms; composite source slice ${startMs}-${endMs} ms.`;
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES (?,?,?,?,? ,?,'hold_for_review',?,?,?)`)
    .run(id, shotId, result.provenance.provider, result.provenance.model, "lip_sync", prompt, result.media.path, result.cost.usd, now);
  db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(), projectId, id, result.cost.usd, now);
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
pending.splice(0, pending.length); save();
console.log(JSON.stringify({ path: result.media.path, sourceMs: [sourceStart, sourceEnd], compositeMs: [startMs, endMs] }, null, 2));
