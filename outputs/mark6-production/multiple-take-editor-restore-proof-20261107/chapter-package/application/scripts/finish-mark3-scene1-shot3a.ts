/** Select Dan-approved 3A, then assemble the existing 3A→3B coverage. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { assembleCoveredSequenceShot } from "../src/pipeline/assembly/assemble-covered-shot.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const SHOT_ID = "b3d64f2d-90ff-4b6c-8cda-dd98391a0d50";
const BEAT_3A_ID = "37150f5d-59a3-418d-8093-20efc36f3cac";
const ATTEMPT_3A_ID = "a5369573-3359-4587-a26d-1eba2c1ea57a";
const ATTEMPT_3B_ID = "51b5ed76-04ef-4bad-a09f-a6b77d3115c0";

function main() {
  const db = getDb(), dataDir = getDataDir();
  const row = db.prepare(`SELECT cb.beat_type,cb.audio_start_ms,cb.audio_end_ms,cb.needs_lip_sync,
      cb.status AS beat_status,cb.keyframe_asset_path,sh.coverage_plan,sh.needs_lip_sync AS shot_needs_lip_sync,
      ga.status AS attempt_status,ga.result_asset_path,ga.prompt
    FROM coverage_beats cb JOIN shots sh ON sh.id=cb.shot_id
    JOIN scenes sc ON sc.id=sh.scene_id AND sc.project_id=?
    JOIN generation_attempts ga ON ga.id=? AND ga.shot_id=sh.id AND ga.operation='generate_coverage_base'
    WHERE cb.id=? AND cb.shot_id=?`).get(PROJECT_ID, ATTEMPT_3A_ID, BEAT_3A_ID, SHOT_ID) as {
      beat_type: string; audio_start_ms: number; audio_end_ms: number; needs_lip_sync: number;
      beat_status: string; keyframe_asset_path: string; coverage_plan: string; shot_needs_lip_sync: number;
      attempt_status: string; result_asset_path: string | null; prompt: string | null;
    } | undefined;
  if (!row || row.beat_type !== "master" || row.audio_start_ms !== 0 || row.audio_end_ms !== 2000 ||
      row.needs_lip_sync !== 0 || row.beat_status !== "accepted" || row.coverage_plan !== "covered_sequence" ||
      row.shot_needs_lip_sync !== 1 || !row.prompt?.includes(`Shot 3A coverage beat ${BEAT_3A_ID}`) ||
      !row.result_asset_path || !existsSync(join(dataDir, "assets", row.result_asset_path))) {
    throw new Error("3A candidate or approved coverage no longer matches the reviewed take.");
  }
  const keyframe = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' AND result_asset_path=?")
    .get(SHOT_ID, row.keyframe_asset_path);
  if (!keyframe) throw new Error("3A's accepted keyframe has changed.");
  const beat3b = db.prepare("SELECT id FROM coverage_beats WHERE shot_id=? AND audio_start_ms=2000 AND audio_end_ms=8183 AND needs_lip_sync=1 AND status='accepted'")
    .get(SHOT_ID);
  const clip3b = db.prepare(`SELECT c.id FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id
    WHERE c.shot_id=? AND ga.id=? AND ga.status='accepted' AND c.timeline_start_ms=2000 AND c.timeline_end_ms=8183`)
    .get(SHOT_ID, ATTEMPT_3B_ID);
  if (!beat3b || !clip3b) throw new Error("The approved 3B beat/clip is missing or changed.");
  const existing = db.prepare("SELECT id,timeline_start_ms,timeline_end_ms FROM clips WHERE generation_attempt_id=?")
    .get(ATTEMPT_3A_ID) as { id: string; timeline_start_ms: number; timeline_end_ms: number } | undefined;
  let clipId = existing?.id;
  if (existing && (existing.timeline_start_ms !== 0 || existing.timeline_end_ms !== 2000)) throw new Error("3A was previously selected at a different interval.");
  if (!existing) {
    if (row.attempt_status !== "hold_for_review") throw new Error("Only the held reviewed 3A candidate can be newly selected.");
    const overlap = db.prepare(`SELECT id FROM clips WHERE shot_id=? AND timeline_start_ms<2000 AND timeline_end_ms>0`)
      .get(SHOT_ID);
    if (overlap) throw new Error("Another clip already covers some of 3A.");
    clipId = randomUUID();
    const now = Date.now();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=? AND status='hold_for_review'")
        .run(ATTEMPT_3A_ID);
      db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,?,?,?)")
        .run(clipId, SHOT_ID, ATTEMPT_3A_ID, 0, 2000, now);
      db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'human',?,1,?)")
        .run(randomUUID(), PROJECT_ID, SHOT_ID,
          `Dan approved 3A candidate ${ATTEMPT_3A_ID} after reviewing the 3A→3B cut. The first two seconds are Jesus speaking in the continuous Hatam line, not narration. This wide angle visibly holds his mouth rather than lip-syncing it; Dan accepted this cut, while noting that a fully lip-synced take or an over-the-shoulder angle concealing the mouth would have been a stronger coverage choice. Selected only 0-2000 ms; approved 3B remains 2000-8183 ms.`, now);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  const priorAssembly = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='assemble_shot' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
    .get(SHOT_ID) as { result_asset_path: string } | undefined;
  const result = priorAssembly?.result_asset_path && existsSync(join(dataDir, "assets", priorAssembly.result_asset_path))
    ? { assembledVideoPath: priorAssembly.result_asset_path, totalDurationMs: 8183, clipCount: 2, reused: true }
    : { ...assembleCoveredSequenceShot(db, SHOT_ID), reused: false };
  const assembledPath = join(dataDir, "assets", result.assembledVideoPath);
  const streams = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", assembledPath], { encoding: "utf8" })) as {
    format?: { duration?: string }; streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  };
  const durationSeconds = Number(streams.format?.duration);
  if (!Number.isFinite(durationSeconds) || Math.abs(durationSeconds - 8.183) > 0.1 ||
      !streams.streams?.some(s => s.codec_type === "audio") ||
      !streams.streams?.some(s => s.codec_type === "video" && s.width === 1280 && s.height === 720)) {
    throw new Error("Assembled 3A→3B video failed duration, audio, or 720p verification.");
  }
  console.log(JSON.stringify({ clipId, assembled: result, durationSeconds }));
}

main();
