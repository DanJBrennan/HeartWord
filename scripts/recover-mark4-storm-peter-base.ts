/** Recover the already-submitted Peter base after a transient polling timeout.
 * It records the provider result exactly once, held for face identification.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const shotId = "6db6f5f1-ced4-4675-82f4-05c772333d01";
const taskId = "932970054562480150";
const db = getDb(), dataDir = getDataDir();
function durationMs(path: string) { return Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], { encoding: "utf8" }).trim()) * 1000); }
async function main() {
  const existing = db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_coverage_base' AND result_asset_path LIKE ?").get(shotId, `%${taskId}%`) as { id: string; result_asset_path: string } | undefined;
  if (existing) { console.log(JSON.stringify({ reused: true, ...existing })); return; }
  const key = process.env.KLING_API_KEY_1; if (!key) throw Error("Kling API key is unavailable.");
  const response = await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${taskId}`, { headers: { Authorization: `Bearer ${key}` } });
  const result = await response.json() as { code: number; data?: { task_status?: string; task_status_msg?: string; task_result?: { videos?: Array<{ url?: string }> } } };
  const url = result.data?.task_result?.videos?.[0]?.url;
  if (!response.ok || result.code !== 0) throw Error("Provider could not retrieve the submitted Peter base.");
  if (result.data?.task_status !== "succeed" || !url) throw Error(`Peter base remains ${result.data?.task_status ?? "unavailable"}: ${result.data?.task_status_msg ?? ""}`);
  const video = await fetch(url); if (!video.ok) throw Error(`Peter base download failed: ${video.status}`);
  const rel = join("generated", "video", `mark4-storm-lipsync-base-${taskId}.mp4`), full = join(dataDir, "assets", rel);
  mkdirSync(join(dataDir, "assets", "generated", "video"), { recursive: true });
  if (!existsSync(full)) writeFileSync(full, Buffer.from(await video.arrayBuffer()), { flag: "wx" });
  const actualMs = durationMs(full); if (actualMs < 3000) throw Error(`Peter base is too short: ${actualMs} ms.`);
  const id = randomUUID(), now = Date.now();
  db.exec("BEGIN IMMEDIATE"); try {
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'kling','kling-v2-6-pro','generate_coverage_base','720p',?,'hold_for_review',?,?,?)")
      .run(id, shotId, "Recovered provider task after transient polling timeout. Approved Peter storm keyframe; silent natural base motion only, held for face identification.", rel, 0.6, now);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)").run(randomUUID(), projectId, id, 0.6, now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)").run(randomUUID(), projectId, shotId, "Peter’s recovered silent base-motion candidate is held for face identification and source-bound lip-sync.", now);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  console.log(JSON.stringify({ taskId, attemptId: id, path: rel, durationMs: actualMs }));
}
main().catch((error) => { console.error("FAILED:", error); process.exitCode = 1; });
