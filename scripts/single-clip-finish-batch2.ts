/**
 * Finishes Scene 2 Shot 3 and Scene 3 Shots 2/3/4's lip-sync. Runs all
 * 4 concurrently (no reason not to -- Kling's confirmed limit is 5
 * in-flight generations, and these are independent shots; the first
 * version of this script ran them sequentially with no justification,
 * caught in review).
 *
 * Two of these (Mark 2:14 "Follow me" and Mark 2:20, both single short
 * lines) have REAL dialogue under 2 seconds -- confirmed via a live
 * Kling rejection ("Audio duration can not less than 2s") on the first
 * attempt. Kling's constraint is on the audio fed to the API, not on
 * the shot's real content, so the fix is to pad the extracted audio
 * with trailing silence up to 2.0s before sending it, while keeping
 * the shot's own clips-row duration at its REAL (sub-2s) length --
 * assembleSingleShot always trims the final muxed output to that real
 * duration regardless of how long the synced source video runs.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const db = getDb();
const dataDir = getDataDir();
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const KLING_MIN_AUDIO_MS = 2000;

interface Job {
  shotId: string;
  faceId: string;
  videoUrl: string;
}

const jobs: Job[] = [
  {
    shotId: "ce87d971-d15f-4a75-b636-1c9dcb52a1fb",
    faceId: "1",
    videoUrl:
      "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/ee8a2ed80dce2116b98fbd4dca8d417f-6bc66c92-d4ad-4fed-9629-0651252cdb32.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAF26HU7bqSeXgQ-9t8jNdi6Z-I2TXo3xCI_i_2GS6EfQALKN90nc39_9NXPWnofNvAw0-Y2MIxltKCldkxtnyXOTWOnJ7wx-vV7aSjx_UviH3h-kNSAHtv9ElE6t_O_9HUV8V12VbQCs_aILRwAmNCm63wYmwqMEKt02AhVBsf97m0J7Mo0hIveXuid6AUhpcgC2xa7OhvfjirogIbDT0OT4OUrxFpv6u3USWChfA54rxoSOFvh80_9xnI_XufDmu_AA0PdIiBKwhOX_3zF9l2YB791WY9Ls1OsBXFHNU7JX4lvVK4EMSgFMAE&x-kcdn-pid=112781&Expires=1791586052&Signature=xlnSJmQaIfQDXe0qNzD6Cojp3p2vCmlYoyE1Z2iD3bFH3YgN2-WQiie-UQN9eLaBxzsxIyLzLWAbS0S2EekZyHNnuqVgW0R04eEWc6YNrv-4t9XtsT91ddTefYPcIBBM0yHoQIPmTgb3DzwnLWRlAI4obOzg81eMAe2Xjh28G2QnD3LOx4vTK6I6rFDRWGFTRKk-OFTFruonZPMc-nMaaIw2efDa9JsnFf5HBBTy3Y6DF2HnXnvs8DRO-6FE7PaJWBBxODEe1tNei-S6WBl30Cbjy59nXz8N2sEqVyxyKPQMMOi1kyxj-FDVT7yXjQa~Q3iyoIsUX3UPDn1p3IGTww__&Key-Pair-Id=K1FG4T7LWJK0FU"
  },
  {
    shotId: "9c291cdd-389e-45db-b737-866543d730c6",
    faceId: "0",
    videoUrl:
      "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/61374324a481de2679b831d435479831-d4487a6c-cfda-4994-844e-2041258a092e.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAFAjhLz3QkZgMpuNPfFRWgHtu1wkq_yWD5uQnqDmWNlw7vC6LAZLY_6ozHVquHWooKozKiwn4HOpaR_mcIYVWYzJGTYVuiO9GhGlD03Nn77SbWpWdBKQdVQnCKwmERVLHXeIOnI84AKa3XJBs9c6HbeOC_HA4g-QayiBl8pEntUP-cyOeyPwMos2_L_F6zBAatw1kmVBLYxYv1yu3B0GG55C_HZ0wdwWT-mvo0bn0xfFhoS0TR4h_eyjkvDOmDeFijUb3cSIiAOKBcl-55ZNhgaB8zqcwx2DkgE0cPDrUGO1Df00Q6-ACgFMAE&x-kcdn-pid=112781&Expires=1791586040&Signature=hZCONh-8rNt8zjtiAtZGvYm0vFn9JHGB8lcAsq3V8doG5RWo8CfkBV~CvfYGmKnn9EGdtRZzqCgVngxtjjkplmhS1dUkBS4jwXTlv9uARtLQA68276PKYsUjW~0vjMICAi7eTmnm2FJD67T80wXK4z2vW3frIOXtFBNCv4nG06Gmcg9fdA~OEjWDVpmXwLHPc4ko~IrNnZEKpTw7nF6ltCfJh~sA9jkzmL-oo~veyFVplu1S4HYyYwHjs1Qi4kAJI7m0KmNSsFGI7xdV9DQ~~AzO6S0K9Fn77FtzIF~PbrD6k---RVqUISX47ZXyCQr23~rxVo1KaHyHJpIvb9CBTg__&Key-Pair-Id=K1FG4T7LWJK0FU"
  }
];

// Padded target is comfortably ABOVE Kling's 2000ms floor, not exactly
// at it -- an exact-2.000s pad was rejected outright ("Audio duration
// can not less than 2s") on the first attempt, almost certainly because
// mp3 encoding rounds the real output duration a few ms under the
// nominal target. 2500ms leaves real margin.
const PADDED_TARGET_MS = 2500;

// AudioSegmentRef.path is always relative to assets/ (KlingFaceLipSyncProvider
// itself joins it with dataDir) -- returning an already-absolute path here
// double-joined and broke ffmpeg's input path on the very first (real,
// paid) run. Only ever return paths relative to assets/.
function padAudioIfShort(relSourcePath: string, startMs: number, endMs: number): { path: string; startMs: number; endMs: number } {
  const realDurationMs = endMs - startMs;
  if (realDurationMs >= KLING_MIN_AUDIO_MS) {
    return { path: relSourcePath, startMs, endMs };
  }
  const padDurationSec = ((PADDED_TARGET_MS - realDurationMs) / 1000).toFixed(3);
  const relDir = join("generated", "lipsync-padded-audio");
  mkdirSync(join(dataDir, "assets", relDir), { recursive: true });
  const relPath = join(relDir, `${randomUUID()}.mp3`);
  // -ss/-t placed BEFORE -i so they trim the INPUT read -- the first
  // attempt put them after -i (output options), which meant "-t
  // <real short duration>" truncated the OUTPUT back down after apad
  // had already extended it, silently cancelling the padding entirely
  // (confirmed via ffprobe: the "padded" file was still the original
  // sub-2s length). Verified this version's actual output duration
  // directly rather than trusting the ffmpeg exit code alone.
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      (startMs / 1000).toFixed(3),
      "-t",
      (realDurationMs / 1000).toFixed(3),
      "-i",
      join(dataDir, "assets", relSourcePath),
      "-af",
      `apad=pad_dur=${padDurationSec}`,
      join(dataDir, "assets", relPath)
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  const actualDurationSec = Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", join(dataDir, "assets", relPath)], {
      encoding: "utf-8"
    }).trim()
  );
  if (!(actualDurationSec * 1000 >= KLING_MIN_AUDIO_MS)) {
    throw new Error(`Padded audio for ${relSourcePath} is still only ${actualDurationSec}s -- padding did not take effect as expected.`);
  }
  return { path: relPath, startMs: 0, endMs: Math.round(actualDurationSec * 1000) };
}

async function processJob(job: Job): Promise<void> {
  const provider = new KlingFaceLipSyncProvider();
  const shot = db.prepare(`SELECT verse_ref FROM shots WHERE id = ?`).get(job.shotId) as any;
  const audioRow = db
    .prepare(`SELECT source_path, start_ms, end_ms FROM audio_segments WHERE layer='composite_cast_master' AND verse_ref = ?`)
    .get(shot.verse_ref) as any;
  const realDurationMs = audioRow.end_ms - audioRow.start_ms;

  const syncAudio = padAudioIfShort(audioRow.source_path, audioRow.start_ms, audioRow.end_ms);
  if (syncAudio.startMs !== audioRow.start_ms || syncAudio.endMs - syncAudio.startMs !== realDurationMs) {
    console.log(`${job.shotId}: real audio is ${realDurationMs}ms, under Kling's 2000ms minimum -- padded with trailing silence for the API call only.`);
  }

  const result = await provider.syncFace(job.videoUrl, job.faceId, syncAudio, 0);
  console.log(`${job.shotId} -> ${result.status}, ${result.media?.path}, $${result.cost.usd}`);

  const attemptId = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO generation_attempts (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
     VALUES (?, ?, 'kling', 'lip-sync-audio2video', 'lip_sync', '1280x720', NULL, ?, ?, ?, ?)`
  ).run(attemptId, job.shotId, result.status, result.media?.path ?? null, result.cost.usd, now);
  db.prepare(`INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    randomUUID(), projectId, attemptId, result.cost.usd, now
  );
  // clips row keeps the REAL duration (may be under 2s) -- assembleSingleShot
  // always trims the final muxed output to this, regardless of how long
  // the synced source video runs.
  db.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, 0, ?, ?)`).run(
    randomUUID(), job.shotId, attemptId, realDurationMs, now
  );

  const assembled = assembleSingleShot(db, job.shotId);
  console.log(`  ${job.shotId} assembled -> ${assembled.assembledVideoPath} (hasDialogueAudio=${assembled.hasDialogueAudio})`);
}

async function run() {
  const results = await Promise.allSettled(jobs.map(processJob));
  for (const r of results) {
    if (r.status === "rejected") console.error("A job failed:", r.reason);
  }
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
