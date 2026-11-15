import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const shotId = "8209a47b-eaa0-4dcd-9a43-e3a9afd2e369";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/19-mark-2-22-elevenlabs.mp3";

const beat1VideoUrl =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/87463c7617b5e22ef4c569c2f7794fd3-df7117bf-ef01-4622-a011-e381d221b4ff.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAGH8PtDPRT1gr1sIFgCGnWqOanBL9IK_xOBnPGrhaOAstXbFw6Nr1JReOd6XhH2WiEZpKv3cA8361LtG0R6ARqXHvDQp7FeoH5eP3kdKRRITwceFXCNUxQ3tN3EX57jTj5KK1chZbRsPhm4lbQeFWMrWr3PLMItBojdU3qVUiGZQ9Y710X3SkA4xKsptAsom9h44hxsAM9L5dsGyEI6_9EP_7hYkSscuC2Ey_fNTOic9xoSsdEjH3N5CFugfV1OmSbeCusDIiA9spvxa-9uysefM6qLNTP4RdE1uml6lnd_vV22CmgZwygFMAE&x-kcdn-pid=112781&Expires=1791577530&Signature=Oo7SR2RIisGkAwTrwMPUr7EDkXZR8gmj~J6sPAXnIjfzWH~V9LIn3zMWCCS0-rJJjLqeFc9fB9Wm8x949ml8son9Cij3GwkdRlv2ihTMWk25Xhyc9nJWH~ve74D-~Mh18MLOevcCEyXv67hPw-CbUzgFNDNwadRy6L4eKrkE5ur7OdeDzR96HU4YCooTIndLNdkCmuYFYIu6BGXnS~yd5H4l2fi482v7F~SMe9sNZgav3WPJIEHijrTxWNoUDtVa5lSvuudH7DzCgO~UpJHr8~doLkqlFrwrfuteCAn71doVrIiqoZ6lfgX-n5hFQsqO4akn9QS1m7vSwYdjdzqpoA__&Key-Pair-Id=K1FG4T7LWJK0FU";

async function run() {
  const provider = new KlingFaceLipSyncProvider();
  const result = await provider.syncFace(beat1VideoUrl, "1", { path: audioPath, startMs: 0, endMs: 3500 }, 0);
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
