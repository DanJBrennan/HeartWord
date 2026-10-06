/** Apply Dan's first pilot review without touching unrelated Mark 4 media.
 * Peter and the command are accepted. The two question takes are copied into
 * exact speech-end trim candidates, leaving their full-length takes retained.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { acceptLipSyncCandidate } from "../src/pipeline/voice-lipsync/candidate-selection.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const accepted = [
  ["Peter plea", "332fc91d-54dc-4741-a637-d5be716ae6f9"],
  ["Jesus command", "fa3764a3-6102-46d9-93e2-26e2a31af9b3"]
] as const;
const trims = [
  ["Jesus question, first beat", "89ba4fb7-5e0a-4049-b4f2-6ec9fc778d64", "bd6c9946-bc22-4c0d-a4d3-a18fef24ba97", 2500],
  ["Jesus question, second beat", "404d00a7-a0c5-4d64-ae50-281e60f93302", "ee5a5e21-3dc6-4df7-a7e4-5a8104c71f14", 2415]
] as const;
const db = getDb(), dataDir = getDataDir();

function durationMs(path: string) { return Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], { encoding: "utf8" }).trim()) * 1000); }

for (const [label, attemptId] of accepted) {
  const result = acceptLipSyncCandidate(db, projectId, attemptId);
  console.log(JSON.stringify({ label, accepted: true, ...result }));
}

for (const [label, shotId, sourceAttemptId, trimMs] of trims) {
  const source = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND operation='lip_sync' AND status='hold_for_review'").get(sourceAttemptId, shotId) as { result_asset_path: string } | undefined;
  if (!source) throw Error(`${label} source candidate is unavailable.`);
  const existing = db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' AND prompt=?").get(shotId, `Dan-approved speech-end trim at ${trimMs} ms from ${sourceAttemptId}.`) as { id: string; result_asset_path: string } | undefined;
  if (existing && existsSync(join(dataDir, "assets", existing.result_asset_path))) { console.log(JSON.stringify({ label, trimCandidate: existing.id, reused: true })); continue; }
  const sourcePath = join(dataDir, "assets", source.result_asset_path);
  const rel = join("generated", "lipsync-face", `mark4-storm-speech-end-trim-${randomUUID()}.mp4`);
  const output = join(dataDir, "assets", rel); mkdirSync(join(dataDir, "assets", "generated", "lipsync-face"), { recursive: true });
  execFileSync("ffmpeg", ["-y", "-i", sourcePath, "-t", (trimMs / 1000).toFixed(3), "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output], { stdio: ["ignore", "ignore", "pipe"] });
  const actualMs = durationMs(output);
  if (actualMs < trimMs - 100 || actualMs > trimMs + 100) throw Error(`${label} trim duration ${actualMs} ms does not preserve speech endpoint ${trimMs} ms.`);
  const id = randomUUID(), now = Date.now();
  db.exec("BEGIN IMMEDIATE"); try {
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_ffmpeg','source-bound-speech-end-trim','lip_sync','1904x1072',?,'hold_for_review',?,?,?)")
      .run(id, shotId, `Dan-approved speech-end trim at ${trimMs} ms from ${sourceAttemptId}.`, rel, 0, now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'human',?,0,?)")
      .run(randomUUID(), projectId, shotId, `${label}: Dan approved the performance and requested an exact speech-end trim before post-speech mouth movement. The original full take remains retained.`, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ label, trimCandidate: id, durationMs: actualMs, path: rel }));
}
