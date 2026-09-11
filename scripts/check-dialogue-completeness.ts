/**
 * Checks every lip-synced shot's ACTUAL accepted clip duration against
 * the REAL required dialogue length (from the composite_cast_master
 * audio_segments row for its verse_ref) -- catches shots whose accepted
 * take is a shorter regenerated clip that never got reconciled with the
 * real dialogue length, silently cutting off part of a real spoken line
 * (found 2026-09-10: Shot 5 and Shot 10 were each missing ~2.5s of real
 * Hatam dialogue audio, masked because the DB's own timeline_end_ms -
 * timeline_start_ms field still recorded the old longer duration).
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const PROJECT_ID = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const FLAG_THRESHOLD_MS = 300;

function ffprobeDurationMs(absPath: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", absPath], {
    encoding: "utf-8"
  });
  return Math.round(parseFloat(out.trim()) * 1000);
}

const db = getDb();
const dataDir = getDataDir();

const shots = db
  .prepare(
    `SELECT s.id AS shot_id, s.verse_ref, sc.sequence AS scene_seq, s.sequence AS shot_seq
     FROM shots s JOIN scenes sc ON sc.id = s.scene_id
     WHERE sc.project_id = ? AND s.needs_lip_sync = 1
     ORDER BY sc.sequence, s.sequence`
  )
  .all(PROJECT_ID) as Array<{ shot_id: string; verse_ref: string; scene_seq: number; shot_seq: number }>;

console.log(`Checking ${shots.length} lip-synced shots' real dialogue completeness...\n`);

let flagged = 0;
for (const shot of shots) {
  const clip = db
    .prepare(
      `SELECT ga.result_asset_path FROM clips cl
       JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id
       WHERE cl.shot_id = ? AND ga.operation = 'assemble_shot' AND ga.status = 'accepted'
       ORDER BY ga.created_at DESC LIMIT 1`
    )
    .get(shot.shot_id) as { result_asset_path: string } | undefined;
  if (!clip) {
    console.log(`[${shot.scene_seq}.${shot.shot_seq}] ${shot.verse_ref}: NO ACCEPTED CLIP`);
    continue;
  }

  const audioRow = db
    .prepare(
      `SELECT start_ms, end_ms FROM audio_segments WHERE verse_ref = ? AND source_path LIKE '%composite_cast_master%'`
    )
    .get(shot.verse_ref) as { start_ms: number; end_ms: number } | undefined;
  if (!audioRow) {
    console.log(`[${shot.scene_seq}.${shot.shot_seq}] ${shot.verse_ref}: no composite_cast_master audio_segments row found, skipping`);
    continue;
  }

  const requiredMs = audioRow.end_ms - audioRow.start_ms;
  const actualMs = ffprobeDurationMs(join(dataDir, "assets", clip.result_asset_path));
  const shortfallMs = requiredMs - actualMs;
  const flag = shortfallMs > FLAG_THRESHOLD_MS ? "  <<<< MISSING REAL DIALOGUE" : "";
  if (flag) flagged++;
  console.log(
    `[${shot.scene_seq}.${shot.shot_seq}] ${shot.verse_ref}: required=${requiredMs}ms actual=${actualMs}ms shortfall=${shortfallMs}ms${flag}`
  );
}

console.log(`\n${flagged} shot(s) flagged with real dialogue audio missing (>${FLAG_THRESHOLD_MS}ms shortfall).`);
