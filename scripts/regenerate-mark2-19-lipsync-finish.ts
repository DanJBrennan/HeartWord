import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const db = getDb();
const SHOT_ID = "9a1b2acb-6da9-4291-a4e1-5cbd78629e2c";
const VIDEO_URL =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260911/bbf04688815b327d7e8f45796416f96c-5bbd3bf6-943a-44b3-bcd5-f4e70875324a.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAG3VFHmUm_Z03V-Eh5Pf44ndSfYbGbqa1yIjRgXChO4XAITB-K0d8VW4NzOsDNwnzEX_kQaUuLB1-AjN1IwsrdRMr_j0Y5EcESHo5KT-rG-90WmKBl-lntMD_v2WA8d0_BUkCGphK97SnCiMwJ5KTHwTzD7UI_HoASXzbLC770YX-vMS8uHhiEjRmDYPdEjhhzf2GosWq5FuA6hoN1svRTOw1IrvHabcrGEQA87DMNwrRoSqwnSbF-azU9cbKSOb8doGVG2IiA41Ar3wMfPLwNhQRgEgKhWWPpf9-ZH0ZMfwXgkgiOR6ygFMAE&x-kcdn-pid=112781&Expires=1791680586&Signature=VMaIvYwZpXtTFHQfNs-8xFYjSWS0t97nkOHLdtZcQDSbd8fB6qgR41t1Rq3NmRO4jPtVF0by75JnpP2QbnhhpN7rvHr7NmFcxFoTTB07Ox36OjHoQY3jnIoSI8812V1wru1oVPnU86hFsPr5Ym~PCft8EUpczHpT8n1y8RF9L5g5ZebgY53SdBVzycwVLUa9i8Lj-2I4jjUJtmLRAk1dk2vzgAq2mUkYhfcSe3eR0P1teZfnQ~GB51HahEgfgfmyN7SEoUnA8QEivHdzWMbwDK4L0hAUYVwBMBSmIChNpLWNXeWAXbLcAFS5bsUAXepOXEvCdQ1M9hT~2aVQMQWBXg__&Key-Pair-Id=K1FG4T7LWJK0FU";
const FACE_ID = "1";

async function run() {
  const faceProvider = new KlingFaceLipSyncProvider();
  const audioRow = db
    .prepare(`SELECT source_path, start_ms, end_ms FROM audio_segments WHERE verse_ref = 'Mark 2:19' AND source_path LIKE '%composite_cast_master%'`)
    .get() as { source_path: string; start_ms: number; end_ms: number };

  console.log("Calling syncFace...");
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
  console.log(`Inserted raw clip, duration=${audioRow.end_ms - audioRow.start_ms}ms`);

  console.log("Re-running assembleSingleShot...");
  const assembled = assembleSingleShot(db, SHOT_ID);
  console.log("Assembled:", JSON.stringify(assembled, null, 2));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
