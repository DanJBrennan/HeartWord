/**
 * Verifies every lip-synced shot's ALREADY ASSEMBLED clip has its video
 * and audio streams the same length -- Dan noticed a few clips seeming
 * off by a fraction of a second. Checks internal audio/video sync
 * directly (ffprobe each stream's own duration within the same file)
 * rather than re-deriving an "expected" audio duration by guessing which
 * audio_segments row applies -- that guess is exactly the kind of
 * verse-boundary/exact-match ambiguity this project has been bitten by
 * before (see assemble-single-shot.ts's own verse-match fallback
 * history), so it isn't a reliable way to detect drift on its own.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const PROJECT_ID = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";

function ffprobeStreamDurationMs(absPath: string, streamType: "v" | "a"): number | null {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", streamType, "-show_entries", "stream=duration", "-of", "default=noprint_wrappers=1:nokey=1", absPath],
    { encoding: "utf-8" }
  ).trim();
  if (!out) return null;
  return Math.round(parseFloat(out.split("\n")[0]) * 1000);
}

async function run() {
  const db = getDb();
  const dataDir = getDataDir();

  const lipSyncShots = db
    .prepare(
      `SELECT s.id, s.verse_ref, sc.sequence AS scene_seq, s.sequence AS shot_seq
       FROM shots s JOIN scenes sc ON sc.id = s.scene_id
       WHERE sc.project_id = ? AND s.needs_lip_sync = 1
       ORDER BY sc.sequence, s.sequence`
    )
    .all(PROJECT_ID) as Array<{ id: string; verse_ref: string; scene_seq: number; shot_seq: number }>;

  console.log(`Checking ${lipSyncShots.length} lip-synced shots (internal audio/video stream sync)...\n`);
  let flagged = 0;

  for (const shot of lipSyncShots) {
    const assembledClip = db
      .prepare(
        `SELECT ga.result_asset_path FROM clips cl
         JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id
         WHERE cl.shot_id = ? AND ga.operation = 'assemble_shot' AND ga.status = 'accepted'
         ORDER BY ga.created_at DESC LIMIT 1`
      )
      .get(shot.id) as { result_asset_path: string } | undefined;
    if (!assembledClip) {
      console.log(`[${shot.scene_seq}.${shot.shot_seq}] ${shot.verse_ref}: no assembled clip found -- skipping`);
      continue;
    }

    const absPath = join(dataDir, "assets", assembledClip.result_asset_path);
    let videoMs: number | null;
    let audioMs: number | null;
    try {
      videoMs = ffprobeStreamDurationMs(absPath, "v");
      audioMs = ffprobeStreamDurationMs(absPath, "a");
    } catch {
      console.log(`[${shot.scene_seq}.${shot.shot_seq}] ${shot.verse_ref}: could not ffprobe assembled clip -- skipping`);
      continue;
    }
    if (videoMs === null || audioMs === null) {
      console.log(`[${shot.scene_seq}.${shot.shot_seq}] ${shot.verse_ref}: missing video or audio stream (v=${videoMs}, a=${audioMs}) -- FLAG`);
      flagged++;
      continue;
    }
    const driftMs = audioMs - videoMs;
    const status = Math.abs(driftMs) > 80 ? "FLAG" : "ok";
    if (status === "FLAG") flagged++;
    console.log(`[${shot.scene_seq}.${shot.shot_seq}] ${shot.verse_ref}: video=${videoMs}ms, audio=${audioMs}ms, internal drift=${driftMs}ms -- ${status}`);
  }

  console.log(`\n${flagged} shot(s) flagged with internal video/audio drift over 80ms.`);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
