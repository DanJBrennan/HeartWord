/**
 * Submit exactly one approved canonical-Jesus base for source-bound face lip
 * sync.  This is deliberately serialized and held-for-review: it neither
 * selects the result nor changes the Mark 4 assembly.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

type Item = {
  key: string;
  shotId: string;
  passage: string;
  startMs: number;
  endMs: number;
  audioPath: string;
  durationMs: number;
};
type Face = { candidate: number; faceId: string; path: string };
type FaceRecord = { key: string; candidates: Face[] };
type Pending = { key: string; taskId: string };
type ProviderTask = {
  code: number;
  data?: { task_status?: string; task_result?: { videos?: Array<{ url?: string }> } };
};

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir();
const assetsDir = join(dataDir, "assets");
const root = join(assetsDir, "generated", "pilot-source", "mark4-v34-canonical-performances");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as { prepared: Item[] };
const faces = JSON.parse(readFileSync(join(root, "faces.json"), "utf8")) as FaceRecord[];
const pendingPath = join(root, "pending-lipsync.json");
const pending: Pending[] = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, "utf8")) as Pending[] : [];
const savePending = () => writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
const db = getDb();
const provider = new KlingFaceLipSyncProvider();

const next = manifest.prepared.find((item) => {
  const prior = db.prepare(
    "SELECT status FROM generation_attempts WHERE shot_id=? AND operation='canonical_v34_lip_sync' ORDER BY created_at DESC LIMIT 1"
  ).get(item.shotId) as { status: string } | undefined;
  // An accepted take is final for this held review stage. A producer-rejected
  // take is explicitly retryable, while an unresolved held take must never be
  // silently replaced.
  return !prior || prior.status === "retry_modified";
});
if (!next) {
  console.log(JSON.stringify({ complete: true, count: manifest.prepared.length }));
  process.exit(0);
}
if (pending.some((entry) => entry.key === next.key)) {
  throw new Error(`${next.key} already has a durable lip-sync task. Recover it; do not submit a duplicate.`);
}
if (!existsSync(join(assetsDir, next.audioPath))) {
  throw new Error(`${next.key} is missing its prepared exact source-audio excerpt.`);
}

const faceRecord = faces.find((entry) => entry.key === next.key);
if (!faceRecord || faceRecord.candidates.length !== 1 || faceRecord.candidates[0]?.candidate !== 1 || !faceRecord.candidates[0]?.faceId) {
  throw new Error(`${next.key} lacks exactly one visually verified face target; refusing to guess.`);
}
const face = faceRecord.candidates[0];
if (!existsSync(join(assetsDir, face.path))) {
  throw new Error(`${next.key} is missing the saved thumbnail for its verified face target.`);
}

const base = db.prepare(
  "SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='canonical_v34_base' AND status='hold_for_review' AND result_asset_path IS NOT NULL ORDER BY created_at DESC LIMIT 1"
).get(next.shotId) as { result_asset_path: string } | undefined;
const baseTaskId = base?.result_asset_path.match(/-(\d+)\.mp4$/)?.[1];
if (!baseTaskId) throw new Error(`${next.key} lacks a recoverable held base-motion task.`);

const apiKey = process.env.KLING_API_KEY_1;
if (!apiKey) throw new Error("KLING_API_KEY_1 is not configured.");
const baseResponse = await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${baseTaskId}`, {
  headers: { Authorization: `Bearer ${apiKey}` }
});
const baseTask = await baseResponse.json() as ProviderTask;
const baseUrl = baseTask.data?.task_result?.videos?.[0]?.url;
if (!baseResponse.ok || baseTask.code !== 0 || baseTask.data?.task_status !== "succeed" || !baseUrl) {
  throw new Error(`${next.key} base task ${baseTaskId} is not recoverable from Kling.`);
}

let submittedTaskId = "";
const result = await provider.syncFace(
  baseUrl,
  face.faceId,
  { path: next.audioPath, startMs: 0, endMs: next.durationMs },
  0,
  async (taskId) => {
    submittedTaskId = taskId;
    pending.push({ key: next.key, taskId });
    savePending();
  }
);
if (!result.media || !existsSync(join(assetsDir, result.media.path))) {
  throw new Error(`${next.key} lip-sync output was not retained.`);
}

const now = Date.now();
const attemptId = randomUUID();
const prompt = [
  `Mark 4 approved canonical Jesus held performance ${next.key} (${next.passage}).`,
  `Exact source interval ${next.startMs}-${next.endMs} ms; prepared cast excerpt ${next.audioPath}.`,
  `Face target is the single provider-detected, visually verified Candidate 1 (${face.faceId}).`,
  "Held review only: never selected into the chapter timeline."
].join(" ");
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES (?,?,?,?,? ,?,'hold_for_review',?,?,?)`)
    .run(attemptId, next.shotId, result.provenance.provider, result.provenance.model, "canonical_v34_lip_sync", prompt, result.media.path, result.cost.usd, now);
  db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(), projectId, attemptId, result.cost.usd, now);
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
const pendingIndex = pending.findIndex((entry) => entry.key === next.key && entry.taskId === submittedTaskId);
if (pendingIndex < 0) throw new Error(`${next.key} completed without its durable submission record.`);
pending.splice(pendingIndex, 1);
savePending();
console.log(JSON.stringify({ key: next.key, path: result.media.path, heldForReview: true }, null, 2));
