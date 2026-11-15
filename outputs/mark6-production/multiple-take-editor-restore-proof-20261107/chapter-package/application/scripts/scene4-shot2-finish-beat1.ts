import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const shotId = "94a721a3-1fc6-44d1-a9e2-9021e26ec408";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/21-mark-2-24-elevenlabs.mp3";

const beat1VideoUrl =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/0b4b8a912fbe215c4f715e937071835c-82f66a03-2b10-4a05-b7c1-9144ba9f2054.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAGn2z5RcuEg6ss3AyfrtlfeFjxdFoYQBMVl0Hc89_XlgGDyHf6YeFiEjT6AVEF9OmXAiMEdVUsx9JgHMIPqWDh5bRA7hyulk9R-THdIcsuF7r-F06yAuHWPI7Asm7nA2-LOaLvL95DAugv0p5kAAVLYYvsg-9yyqs38nrdmAHh82lcPSmx7LB-x_Xd3Q3gsuxjTOikTiMpYrXTEpoyX0a2qmGyjugwcqES1U2A67pUpJhoSS2Y9drB8Z4ednHxTIh7XZcnaIiAFFhzHeADW6dsVL2Jny6z9wmgWXRPq0FNejv7uiUi9jCgFMAE&x-kcdn-pid=112781&Expires=1791579664&Signature=LZ7gRvTvVVzFOg1QF5NNcmQWemsZELswuX3O7vOX25fb8wdGB8kiz1tFgaZInwjLSVHP4HI2~PgiLh2NC9VLR8PYXOH4B0eLcy5AhGCDC5c2kYW7j~wxvedkq49MWkOTyF4HU5bu8JCJZ5kZPaSXhgPJIzJYdU2wsxCvEOqTzRrh1Bgfp0y5xWd5rkUK54ok5Sq5O1pPs1z0TtXKidIimA0~8KpchOsvl5Jjjp5w-cxTObZ1oiDm~KLGtOI0H2NDJ~VDPwRHhtzhjxigWFtkUzrDqY6rsU4eTKIncoU0mbAOXDqc~8Fy6hw17D1hHuLGdh1Ts1FAYAveloeC5kXlqQ__&Key-Pair-Id=K1FG4T7LWJK0FU";

async function run() {
  const provider = new KlingFaceLipSyncProvider();
  const result = await provider.syncFace(beat1VideoUrl, "3", { path: audioPath, startMs: 0, endMs: 3500 }, 0);
  console.log(`beat 1 -> ${result.status}, ${result.media?.path}, $${result.cost.usd}`);

  const attemptId = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO generation_attempts
       (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
     VALUES (?, ?, 'kling', 'lip-sync-audio2video', 'lip_sync', '1280x720', NULL, ?, ?, ?, ?)`
  ).run(attemptId, shotId, result.status, result.media?.path ?? null, result.cost.usd, now);
  db.prepare(`INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    randomUUID(), projectId, attemptId, result.cost.usd, now
  );
  db.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, 0, 3500, ?)`).run(
    randomUUID(), shotId, attemptId, now
  );
  console.log("beat 1 clip row inserted");
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
