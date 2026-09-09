/**
 * Finishes Scene 2 Shot 7: beat 1's face lip-sync (confirmed face_id "0"
 * = the scribe, the only face detected) and beat 2's Avatar lip-sync on
 * a cropped version of the shot's own keyframe (isolating the scribe
 * from the soft-focus background diners -- see scene2-shot7-video.ts's
 * header for why no crop was needed for identify-face but one is kept
 * here as a conservative precaution against Avatar's "syncs every
 * detected face" behavior).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider, KlingLipSyncProvider } from "../src/providers/kling/index.js";
import { cropKeyframe } from "../src/pipeline/media-generation/crop-keyframe.js";

const db = getDb();
const dataDir = getDataDir();
const shotId = "462acce5-2fd3-41df-a38f-872e29a891f3";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/11-mark-2-16-elevenlabs.mp3";

const scribe = { characterId: "3a50ba1f-955f-47ef-80ab-deeec15de742", characterVersionId: "936c2031-3abd-4240-a90a-b7f8b3d56915" };

const beat1VideoUrl =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/90c45d6e3b26a5a8ced650a4628a9fe5-7d74b891-4215-4d78-9cff-3f4ec1c65043.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAFP7n4LOkbJMl6PFvkdH711SEwzri7CfBDeQz2ZsDdL3RGTbaZ6CK3lb20YWO_AFirpu1Z8LCAzbxNTbeAp8ohAy4SxdLAj8Hkf-sGZIteVpvB7M9XfyhwzVR1L3z78cUz9hHIDjPUad7LVIGxHgpNRE65bLDx9V4y1TBflFMpd04mMIUmT4cDYriuMGfchWNg_KJR1dQm7NTE41msURH8W9Oqkf9aQh8uIkZK8Gy0LkRoSOFvh80_9xnI_XufDmu_AA0PdIiDoZHDov7Es0xCpYeqjqr5RbJAWHIhw_B6Ml0FHvmysWCgFMAE&x-kcdn-pid=112781&Expires=1791571356&Signature=Hv8XEfe7EuBvH6UhJVK8wHy~LZAu3rtPYbGeMNGxcNb5pOZSzkHzAAlwJFwLrPgjnfSiCUPGliziuHHclSQVWgNhsLilVzNdvYaPgMjx52oWCLLt1K8CxdO9V3OO-tX7OHcEOYJmPR07l1aDgwmqFMqPIegoGfWXzgDiWColZODd5mEqdfY7YrkX~RtgPoPDY8MpUPhzwoO~3xESMzTfjWXMpSsVdiJFDYIGDMETD4UHgc5x7TeRQQu94b5TuRu~KVBO7TLJepG1sW07VbGkgVWxVAZpZhQIAjGmb6eIRkpbY3kXv5166aygJTyHDwoaQBWGTc7xtGFQmhKQiL6EFw__&Key-Pair-Id=K1FG4T7LWJK0FU";

const insertAttempt = db.prepare(
  `INSERT INTO generation_attempts
     (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertCostEntry = db.prepare(`INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)`);
const insertClip = db.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)`);

function record(provider: string, model: string, operation: string, result: any, startMs: number, endMs: number) {
  const attemptId = randomUUID();
  const now = Date.now();
  insertAttempt.run(attemptId, shotId, provider, model, operation, "1280x720", result.provenance.prompt ?? null, result.status, result.media?.path ?? null, result.cost.usd, now);
  insertCostEntry.run(randomUUID(), projectId, attemptId, result.cost.usd, now);
  insertClip.run(randomUUID(), shotId, attemptId, startMs, endMs, now);
}

async function run() {
  const faceProvider = new KlingFaceLipSyncProvider();
  console.log("beat 1: face lip-sync...");
  const beat1Result = await faceProvider.syncFace(beat1VideoUrl, "0", { path: audioPath, startMs: 0, endMs: 3500 }, 0);
  console.log(`  -> ${beat1Result.status}, ${beat1Result.media?.path}, $${beat1Result.cost.usd}`);
  record("kling", "lip-sync-audio2video", "lip_sync", beat1Result, 0, 3500);

  console.log("beat 2: cropping shot keyframe, Avatar lip-sync...");
  const shotKeyframe = db
    .prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`)
    .get(shotId) as { result_asset_path: string };
  const sourceAbs = join(dataDir, "assets", shotKeyframe.result_asset_path);
  const croppedRel = join("generated", "keyframes", "cropped", "462acce5-shot7-beat2.png");
  const croppedAbs = join(dataDir, "assets", croppedRel);
  cropKeyframe(sourceAbs, { x: 200, y: 0, width: 900, height: 506 }, croppedAbs);

  const avatarProvider = new KlingLipSyncProvider();
  const beat2Result = await avatarProvider.sync(scribe, { path: audioPath, startMs: 3500, endMs: 8684 }, { path: croppedRel });
  console.log(`  -> ${beat2Result.status}, ${beat2Result.media?.path}, $${beat2Result.cost.usd}`);
  record("kling", "avatar-image2video", "lip_sync", beat2Result, 3500, 8684);

  console.log("done.");
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
