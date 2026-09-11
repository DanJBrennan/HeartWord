/**
 * Completes regenerate-shot10-quote-lipsync.ts: face_id "1" was visually
 * confirmed as the crowd spokesperson (short curly hair, heavier build,
 * stern brow -- matches characters/mark-crowd-stern-man canon turnaround
 * exactly). Runs the real audio-driven lip-sync with the CORRECTED
 * quote audio, then replaces the shot's stale clip/attempt and
 * reassembles.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const db = getDb();
const shotId = "27416798-3186-468a-978d-35b74297ea2f";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/07-mark-2-12-elevenlabs.mp3";

const sceneVideoUrl =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260911/30afb109035773fdffecb820f9d6afbb-65a5f75b-32ed-4076-9f03-0a2f1b8d9da7.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAHQn9bMAs6abnMt4RHNyTp4-IpYG5x12XosrT7d1VTscVV-pIrJ6fZ_1FlTHeRdhsBslFW9u3rl_zLe6LOSoxBQdgeElRlRoaEIL6Ex-vHBBaBfWhZU4xrEY_7wHgG1I35SHQAVW7fvYSdIH6vUGIgIfFzdRaR10VnQhI6SupILsFQxYMN440yEh0gps8RFXISlA_CfkWeDV6L6RsmUdagaruYuKaZTPSXPPgbPLUVF4BoSnEyggwjlEmAabESg8cJCaRyFIiC-ohwBpvUKNOBGTu_02Ez6hK91KX509Avfk3thFDCyeCgFMAE&x-kcdn-pid=112781&Expires=1791690813&Signature=jPp2gugrVkGvxgy3Uz4Zs-g3DPnVKWQebOjkXyQ1WhcHaIiHrS3d-XJgkuqpvuylSX4AaypKmKOzYIIT1dpHbF9yHad5mov~e7lGW5CTAQuWGLk-FzgI41LTYKzoZUDTtY8hf4W4ebSD-iZqmrmsdPKygOh2NMpG5qGJiQDUdHKZQHpZ5rlo29eOktHjllHubtkmMyWnwebRnvUkVTxGI18oFd~qTVz6ByGv4ruWvHr337rBXi8ripTfc1JXDhEi59LJklgIRXJg-1jXFZrxhJTu110rGIvs8Hf3Dq8Tehmer8W2qWLhxvxhYO1IPbBCV2wCnjQY4IpheiCRrQwzEw__&Key-Pair-Id=K1FG4T7LWJK0FU";

async function run() {
  const provider = new KlingFaceLipSyncProvider();
  const result = await provider.syncFace(sceneVideoUrl, "1", { path: audioPath, startMs: 0, endMs: 4690 }, 0);
  console.log(`lip-sync -> ${result.status}, ${result.media?.path}, $${result.cost.usd}`);

  const old = db.prepare(`SELECT id, generation_attempt_id FROM clips WHERE shot_id = ?`).all(shotId) as Array<{ id: string; generation_attempt_id: string }>;
  for (const o of old) {
    db.prepare(`DELETE FROM clips WHERE id = ?`).run(o.id);
    db.prepare(`DELETE FROM cost_ledger_entries WHERE generation_attempt_id = ?`).run(o.generation_attempt_id);
  }
  console.log(`removed ${old.length} prior clip row(s)`);

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
  db.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, 0, 4690, ?)`).run(
    randomUUID(),
    shotId,
    attemptId,
    now
  );
  console.log("clip row inserted");

  console.log("reassembling shot...");
  const assembled = await assembleSingleShot(db, shotId);
  console.log("assembled:", JSON.stringify(assembled));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
