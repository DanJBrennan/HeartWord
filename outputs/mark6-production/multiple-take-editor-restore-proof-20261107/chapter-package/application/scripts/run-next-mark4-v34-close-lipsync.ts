/** Apply exact prepared cast audio to one verified close performance base.
 * Results remain held and cannot alter chapter placement. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

type Item = { key: string; shotId: string; passage: string; startMs: number; endMs: number; audioPath: string; durationMs: number };
type FaceRecord = { key: string; candidates: Array<{ candidate: number; faceId: string; path: string }> };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const data = getDataDir(), assets = join(data, "assets"), db = getDb();
const root = join(assets, "generated/pilot-source/mark4-v34-canonical-performances");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as { prepared: Item[] };
const faces = JSON.parse(readFileSync(join(root, "close-faces.json"), "utf8")) as FaceRecord[];
const keys = new Set(["14-20-beat-1", "26-29-beat-3", "30-32-beat-2"]);
const pendingPath = join(root, "pending-close-lipsync.json");
const pending = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, "utf8")) as Array<{ key: string; taskId: string }> : [];
const save = () => writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
const next = manifest.prepared.find((item) => {
  if (!keys.has(item.key)) return false;
  const prior = db.prepare("SELECT status FROM generation_attempts WHERE shot_id=? AND operation='canonical_v34_close_lip_sync' ORDER BY created_at DESC LIMIT 1").get(item.shotId) as { status: string } | undefined;
  return !prior || prior.status === "retry_modified";
});
if (!next) { console.log(JSON.stringify({ complete: true })); process.exit(0); }
if (pending.some((entry) => entry.key === next.key)) throw new Error(`${next.key} has a durable lip-sync task; do not duplicate it.`);
const faceRecord = faces.find((entry) => entry.key === next.key);
if (!faceRecord || faceRecord.candidates.length !== 1 || faceRecord.candidates[0]?.candidate !== 1 || !existsSync(join(assets, faceRecord.candidates[0]?.path ?? ""))) throw new Error(`${next.key} does not have exactly one retained verified face.`);
const base = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='canonical_v34_close_base' AND status='hold_for_review' ORDER BY created_at DESC LIMIT 1").get(next.shotId) as { result_asset_path: string } | undefined;
const taskId = base?.result_asset_path.match(/-(\d+)\.mp4$/)?.[1]; if (!taskId) throw new Error(`${next.key} close base is unavailable.`);
const apiKey = process.env.KLING_API_KEY_1; if (!apiKey) throw new Error("KLING_API_KEY_1 is not configured.");
const response = await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
const task = await response.json() as { code: number; data?: { task_status?: string; task_result?: { videos?: Array<{ url?: string }> } } };
const url = task.data?.task_result?.videos?.[0]?.url;
if (!response.ok || task.code !== 0 || task.data?.task_status !== "succeed" || !url) throw new Error(`${next.key} close base is not recoverable.`);
if (!existsSync(join(assets, next.audioPath))) throw new Error(`${next.key} exact source-audio excerpt is missing.`);
const provider = new KlingFaceLipSyncProvider(); let submitted = "";
const result = await provider.syncFace(url, faceRecord.candidates[0].faceId, { path: next.audioPath, startMs: 0, endMs: next.durationMs }, 0, async (id) => { submitted = id; pending.push({ key: next.key, taskId: id }); save(); });
if (!result.media || !existsSync(join(assets, result.media.path))) throw new Error(`${next.key} output was not retained.`);
const prompt = `Mark 4 closer canonical Jesus held performance ${next.key} (${next.passage}); exact source ${next.startMs}-${next.endMs} ms; verified single face ${faceRecord.candidates[0].faceId}; held review only.`;
const now = Date.now(); db.exec("BEGIN IMMEDIATE");
try {
  const attemptId = randomUUID();
  db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,? ,?,'hold_for_review',?,?,?)`).run(attemptId, next.shotId, result.provenance.provider, result.provenance.model, "canonical_v34_close_lip_sync", prompt, result.media.path, result.cost.usd, now);
  db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)").run(randomUUID(), projectId, attemptId, result.cost.usd, now);
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
const index = pending.findIndex((entry) => entry.key === next.key && entry.taskId === submitted); if (index < 0) throw new Error(`${next.key} lacks durable submit record.`); pending.splice(index, 1); save();
console.log(JSON.stringify({ key: next.key, path: result.media.path, heldForReview: true }, null, 2));
