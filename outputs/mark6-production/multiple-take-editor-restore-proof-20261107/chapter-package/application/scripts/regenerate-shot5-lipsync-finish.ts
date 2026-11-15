/**
 * Finishes the Shot 5 (Mark 2:5) lip-sync regeneration: face 0 confirmed
 * as Jesus (long dark hair, matches canon reference) from the 4
 * candidates in generated/face-thumbs/shot5-redo/. Calls syncFace with
 * the REAL full composite_cast_master dialogue audio (7523ms, not the
 * old truncated 5042ms), then re-runs assembleSingleShot so the final
 * clip picks up this new, complete take.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const db = getDb();
const SHOT_ID = "445d00de-7f66-494d-a104-d3e927d5dbdd";
const VIDEO_URL =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260911/25e96c242e5fccf1ce23c2b1a958153a-db146929-6a0b-4048-bed2-7f5a543ffb04.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAFBsfi65wo1DzZKD-HwaFA3R9fWviMc4IegReHO-oGGw3IRJYsWKcgThpGPZxwqSR1VaPeXDmGC9vqkfox_ZpF0LKrIDUD2zOFf1kENL5RHu5UI00ltwnsHRtlepAUJGJYVOSRH0dIcciI5rtzTjbtfesx8MdMXuc0syWn-Qo_pu_WdwbT7k-jZFuXgT2wzgHXqzQsF9Kj4dYLe8S6I2Lv-Sm8USlNGqhvZQXaFMWEsmxoSYF8ADrg3uvuiuzhTSVrQUvw0IiDexr0xv9Puq4dOHLSI6AYwlGuZrH1H0QdElXJfECyC9SgFMAE&x-kcdn-pid=112781&Expires=1791679964&Signature=eMj90PIJh4vpIuFGjfWm9IeC7aEmWOpmKIYHTt0UeRQ-AzO~LWqtwxGQxB2z7J3YpakEtgyr9Dy5t-5C9bNIyc6NSqpSbMB~S3YMHoqA5KaUvuuADPz1CGHvihRH8ydFTPYFEgNw0yB3D7x5xodsfatiZF9QfS5G1fKYcyFpxZD-PCgvd20sel6CBaijVHZ3nXend-t1WZlWjYuYoy0MEGY0HCeuqtT8e-BuUuuE9SuO2il9lXHJXy1FVrF-VIQ8JzYWQlShSqwAtsyTQ2t9muu3cKTd1LPzkz~jlseMtL4iIihGq6ZKqj1pokCXEH1xdU43sPHwgdOyfOIhuEV7-Q__&Key-Pair-Id=K1FG4T7LWJK0FU";
const FACE_ID = "0";

async function run() {
  const faceProvider = new KlingFaceLipSyncProvider();
  const audioRow = db
    .prepare(`SELECT source_path, start_ms, end_ms FROM audio_segments WHERE verse_ref = 'Mark 2:5' AND source_path LIKE '%composite_cast_master%'`)
    .get() as { source_path: string; start_ms: number; end_ms: number };

  console.log("Calling syncFace with real full dialogue audio...");
  const result = await faceProvider.syncFace(VIDEO_URL, FACE_ID, { path: audioRow.source_path, startMs: audioRow.start_ms, endMs: audioRow.end_ms });
  console.log("Result:", JSON.stringify(result, null, 2));

  const now = Date.now();
  const attemptId = randomUUID();
  db.prepare(
    `INSERT INTO generation_attempts (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
     VALUES (?, ?, 'kling', 'lip-sync-audio2video', 'lip_sync', '1280x720', NULL, 'accepted', ?, ?, ?)`
  ).run(attemptId, SHOT_ID, result.media!.path, result.cost.usd, now);
  db.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, 0, ?, ?)`).run(
    randomUUID(),
    SHOT_ID,
    attemptId,
    audioRow.end_ms - audioRow.start_ms,
    now
  );
  console.log(`Inserted new raw clip row (attempt ${attemptId}), duration=${audioRow.end_ms - audioRow.start_ms}ms`);

  console.log("Re-running assembleSingleShot...");
  const assembled = assembleSingleShot(db, SHOT_ID);
  console.log("Assembled:", JSON.stringify(assembled, null, 2));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
