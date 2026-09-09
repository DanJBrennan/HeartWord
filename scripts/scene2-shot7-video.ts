/**
 * Scene 2 Shot 7 (Mark 2:16, Principal scribe questioning the disciples)
 * -- first shot built with the improved approach validated on Shot 8's
 * redo: a visible on-camera speaker in a wide/master beat gets a real
 * Kling scene generation + KlingFaceLipSyncProvider pass (identify-face,
 * confirm the right face_id by eye, then audio-driven sync) instead of
 * Veo's prompt-invented "talking" performance. This also means the
 * master beat's prompt no longer needs to describe speech cadence or
 * pauses at all -- the real audio drives the mouth directly, so the
 * prompt only needs to set the static scene/pose.
 *
 * Only 2 beats here (simpler than Shot 8):
 *   1 master           0-3500ms    70a575a1-... (own new keyframe, scribe clearly forward-facing)
 *   2 lip_sync_insert  3500-8684ms bd667573-... (reuses shot's own keyframe -- checked: the only
 *                       forward-facing face in it is the scribe; the two disciples in the
 *                       foreground have their backs to camera, so no crop is needed)
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider, KlingLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const dataDir = getDataDir();
const shotId = "462acce5-2fd3-41df-a38f-872e29a891f3";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/11-mark-2-16-elevenlabs.mp3";

const scribe = { characterId: "3a50ba1f-955f-47ef-80ab-deeec15de742", characterVersionId: "936c2031-3abd-4240-a90a-b7f8b3d56915" };

const faceProvider = new KlingFaceLipSyncProvider();
const avatarProvider = new KlingLipSyncProvider();

const insertAttempt = db.prepare(
  `INSERT INTO generation_attempts
     (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertCostEntry = db.prepare(`INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)`);
const insertClip = db.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)`);

function recordClip(provider: string, model: string, operation: string, result: { status: string; media?: { path: string }; cost: { usd: number }; provenance: { prompt: string } }, startMs: number, endMs: number) {
  const attemptId = randomUUID();
  const now = Date.now();
  insertAttempt.run(attemptId, shotId, provider, model, operation, "1280x720", result.provenance.prompt, result.status, result.media?.path ?? null, result.cost.usd, now);
  insertCostEntry.run(randomUUID(), projectId, attemptId, result.cost.usd, now);
  insertClip.run(randomUUID(), shotId, attemptId, startMs, endMs, now);
}

async function run() {
  // ---- Beat 1: master, real face lip-sync ----
  const beat1 = db.prepare(`SELECT * FROM coverage_beats WHERE id = '70a575a1-c7a8-4d88-a268-d8a265273cd6'`).get() as any;
  console.log("Beat 1 (master) -- generating scene video...");
  const { videoUrl } = await faceProvider.generateSceneVideo(
    { path: beat1.keyframe_asset_path },
    "Static medium-wide shot. The Principal scribe stands at the doorway, gesturing with both hands as he addresses the disciples, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.",
    Math.max(1, Math.round((beat1.audio_end_ms - beat1.audio_start_ms) / 1000))
  );
  console.log("identifying faces...");
  const faces = await faceProvider.identifyFaces(videoUrl);
  const thumbDir = join(dataDir, "assets", "generated", "face-thumbs", beat1.id);
  mkdirSync(thumbDir, { recursive: true });
  for (const face of faces) {
    const res = await fetch(face.thumbnailUrl);
    writeFileSync(join(thumbDir, `face-${face.faceId}.jpg`), Buffer.from(await res.arrayBuffer()));
  }
  console.log(`found ${faces.length} face(s) -- thumbnails at ${thumbDir}`);
  console.log(">>> STOP: inspect thumbnails, then run scene2-shot7-finish.ts with the confirmed face_id and this videoUrl. <<<");
  console.log(JSON.stringify({ videoUrl }, null, 2));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
