import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const db = getDb();
const SHOT_ID = "27416798-3186-468a-978d-35b74297ea2f";
const VIDEO_URL =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260911/1b47cd69d5f71f53d210e764fcd8d772-859da3dd-2203-4657-b1ab-29bd66369a77.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAFnrzHCraL6sQTkdsj6iPpIjWBU196VUUuRGDY0UalqqVF7WeFOGZtSsaV5EFXRXKv3dscfdxn-DO2Ox9DIZicCEWeAGRv9cn8jttrAdmvH7tc139dCUEsPsW1cD2YGOslDLeY_ZP9W7dN3BAaY5EUT-pu9Yus49Wb9ZYaM52eVCO-o_0jbenDBjxmBmpTf9Ks-hrj9duWaM-7HSw_4OvNTBSePqJaA2ax8RtYzFrDbzRoSMiIwzDkRLkXJDo0Gm30rVg5KIiBeq2HdiHtCBNalJdcs69TN0w2BP4tHqA4s7ZmiPcz9PSgFMAE&x-kcdn-pid=112781&Expires=1791680543&Signature=rcuplbpBaNhDPXbYkoNnFEjjnSRuP69CJroqLirr1rzOqYrgz8xcUlz~ycMVQje7EDh8Zjiw73OFAJw1P~~teQd46CYr1bvXWsE2FXMcJxLqFYqF4vPBwK3HFpfmUGrAHSue2HWoDYmQaqIyLeEoi2imZRBw2~ckCAxgu5A9T5jYvQsdnL2zNFryo389~CKpdklwJ7yA0vMFCUNdowOhurrMlYjOruiDSHQYenb-SdpeiP6yuTd3m1HEwMpNUiv6Lp~f9MjXdLMGX~Rjzy5OAde76iBF7k9mO4EavBTYKoLKonBVun8sMcP~05bO1UZB1EUNtst8F8CIpbwMT2ulEA__&Key-Pair-Id=K1FG4T7LWJK0FU";
const FACE_ID = "1";

async function run() {
  const faceProvider = new KlingFaceLipSyncProvider();
  const audioRow = db
    .prepare(`SELECT source_path, start_ms, end_ms FROM audio_segments WHERE verse_ref = 'Mark 2:12' AND source_path LIKE '%composite_cast_master%'`)
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
