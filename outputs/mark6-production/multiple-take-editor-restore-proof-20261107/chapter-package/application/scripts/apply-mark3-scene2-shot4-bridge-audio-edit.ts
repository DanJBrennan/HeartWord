/** Applies Dan's deterministic bridge-audio direction without altering the
 * approved visual: mute 0-2s of the provider track, retain 2-4s breathing. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const SOURCE_ATTEMPT = "5426be29-13e7-460b-958c-77d38f2bef94";
const CLIP_ID = "af9afde4-56ad-4233-9ec5-80551d03ddc1";

function run() {
  const db = getDb();
  const dataDir = getDataDir();
  const source = db.prepare("SELECT shot_id,result_asset_path FROM generation_attempts WHERE id=?").get(SOURCE_ATTEMPT) as { shot_id: string; result_asset_path: string } | undefined;
  if (!source?.result_asset_path) throw new Error("The approved bridge source is missing.");
  const outputRel = "generated/video/mark3-scene2-shot4-bridge-first-half-muted.mp4";
  const output = join(dataDir, "assets", outputRel);
  if (!existsSync(output)) {
    mkdirSync(dirname(output), { recursive: true });
    execFileSync("ffmpeg", [
      "-y", "-i", join(dataDir, "assets", source.result_asset_path),
      "-filter:a", "volume=0:enable='between(t,0,2)'",
      "-map", "0:v:0", "-map", "0:a:0",
      "-c:v", "copy", "-c:a", "aac", output
    ], { stdio: ["ignore", "ignore", "pipe"] });
  }
  const current = db.prepare("SELECT generation_attempt_id FROM clips WHERE id=?").get(CLIP_ID) as { generation_attempt_id: string } | undefined;
  if (!current) throw new Error("The selected bridge clip is missing.");
  if (current.generation_attempt_id === SOURCE_ATTEMPT) {
    const now = Date.now(), attemptId = randomUUID();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local','ffmpeg-partial-audio-mute','edit_audio','720p',?,'accepted',?,0,?)`).run(attemptId, source.shot_id, "Producer-directed audio edit: mute 0-2 seconds of the retained bridge provider audio; preserve 2-4 seconds of quiet breathing.", outputRel, now);
      db.prepare("UPDATE clips SET generation_attempt_id=?,timeline_start_ms=0,timeline_end_ms=4000 WHERE id=?").run(attemptId, CLIP_ID);
      const sequence = (db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS next FROM edit_commands WHERE project_id=?").get(PROJECT_ID) as { next: number }).next;
      db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at,undone) VALUES (?,?,?,?,?,?,?,0)").run(randomUUID(), PROJECT_ID, sequence, "replace_clip_audio", JSON.stringify({ clipId: CLIP_ID, sourceAttemptId: SOURCE_ATTEMPT, editedAttemptId: attemptId, muteStartMs: 0, muteEndMs: 2000, preserveStartMs: 2000, preserveEndMs: 4000 }), `mark3-scene2-shot4-bridge-audio-edit-v1`, now);
      db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'clip',?,'human',?,1,?)").run(randomUUID(), PROJECT_ID, CLIP_ID, "Producer direction applied: use the full 4.0-second bridge. The provider vocalization is muted from 0-2 seconds; the quieter breathing is retained from 2-4 seconds. Source narration continuity remains an assembly requirement.", now);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  console.log(outputRel);
}
run();
