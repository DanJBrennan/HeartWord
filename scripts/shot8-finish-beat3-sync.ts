/**
 * Completes shot8-redo-beat3-lipsync.ts: face_id "2" was visually
 * confirmed as Jesus by cropping an actual frame from the scene video
 * and comparing hair/beard/pose against his canon reference and his
 * position in the room (standing, cream robe w/ blue clavi, looking
 * down at the paralytic) -- see turn notes. Runs the real audio-driven
 * face lip-sync, then replaces beat 3's prior (soft-focus, static-mouth)
 * clip/attempt row and reassembles the shot.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";
import { assembleCoveredSequenceShot } from "../src/pipeline/assembly/assemble-covered-shot.js";

const db = getDb();
const shotId = "ea5e2ff9-c321-41f2-9c80-fd856c05d78d";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/05-mark-2-10-11-elevenlabs.mp3";

const beat3VideoUrl =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260911/fc1499962d355dd7bc3ae272fe12fc0a-4131baf1-c809-47c8-a898-9d95e9d835f7.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAG79U5vz9HoXF10rYQ5nt3goGqWAtxYZi_ENxGY91SH-0ASGZhDYCx7rylCX3f68_8bE4pWK-pWB_55-FaoyvQ_b_UOjMeSPFeocyHauwZSJB4Hcrno5YbJbZBJEpyCvXxyst2ZAPFYjhfWjLMbKPvQGI5WZI1ZZARPpKV_z52kv_-ajyu_1Q3iz3M5vNeyQZG1Yao8b0d5MBvijwg5JyusijzbrQ8nVjQVpTw_Z6_IjhoSsdEjH3N5CFugfV1OmSbeCusDIiBfAvNQT2qhs5xtAXAFg9UXBYlTrJrY5dFpiQB3QNft5SgFMAE&x-kcdn-pid=112781&Expires=1791689043&Signature=QbeFUU7WAnvV5wn2Pw-bx-hTH~-44lTCm8xvURF86aZMOPbuWusgdhSL4m9ktMDYt7DKv0b-WwTZd0ZgI68fdEFlHoRzxi6oL9Dwd6Y0zct8PILVPsixfxfLHuBOjy5n4ftRab~BzyMYj0MAoBIP3fR0BMorqXCMX1oKhZaJwDu5h~~AeMgm31RKGvQIMqgkegRvZaDgZE9W-apBiyYDX8ggKaRSXpCO9deTfHPVoTVfKMvm2qhgOm0OMYdN88ySdNXD2pZOJDI-pm3dNPl9K684rTmbaej0qB0gNujKS1zuxVyjXmjVYs8wTCQ2Xvop30QOa6Ha9bvTQL-ZJOZnGw__&Key-Pair-Id=K1FG4T7LWJK0FU";

async function run() {
  const provider = new KlingFaceLipSyncProvider();
  const result = await provider.syncFace(beat3VideoUrl, "2", { path: audioPath, startMs: 9654, endMs: 12654 }, 0);
  console.log(`beat 3 -> ${result.status}, ${result.media?.path}, $${result.cost.usd}`);

  const old = db
    .prepare(`SELECT cl.id, cl.generation_attempt_id FROM clips cl WHERE cl.shot_id = ? AND cl.timeline_start_ms = 9654 AND cl.timeline_end_ms = 12654`)
    .get(shotId) as { id: string; generation_attempt_id: string } | undefined;
  if (old) {
    db.prepare(`DELETE FROM clips WHERE id = ?`).run(old.id);
    db.prepare(`DELETE FROM cost_ledger_entries WHERE generation_attempt_id = ?`).run(old.generation_attempt_id);
    db.prepare(`DELETE FROM generation_attempts WHERE id = ?`).run(old.generation_attempt_id);
    console.log("removed prior beat 3 clip/attempt");
  }

  const attemptId = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO generation_attempts
       (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
     VALUES (?, ?, 'kling', 'lip-sync-audio2video', 'lip_sync', '1280x720', NULL, ?, ?, ?, ?)`
  ).run(attemptId, shotId, result.status, result.media?.path ?? null, result.cost.usd, now);
  db.prepare(`INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    randomUUID(),
    projectId,
    attemptId,
    result.cost.usd,
    now
  );
  db.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, 9654, 12654, ?)`).run(
    randomUUID(),
    shotId,
    attemptId,
    now
  );
  console.log("beat 3 clip row inserted");

  console.log("reassembling shot...");
  const assembled = await assembleCoveredSequenceShot(db, shotId);
  console.log("assembled:", JSON.stringify(assembled));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
