import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const shotId = "44009342-73b8-4b8a-ad46-085d64253258";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/18-mark-2-21-elevenlabs.mp3";

const beat1VideoUrl =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/2905459a393b31bb2196314a326ab102-c91c1732-63af-4f37-8261-2ae35e3c46cf.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAEpL_DmhUXSiaA_9QJISrGlmz96ILbd5tEE-BaiXoWC3b1HCY3d-_wjwgXXhtCNlgWxtYmE0Pl0Pudt2s7TGghCYyl-nd0Nqt7fp0cyJAVsWaaEdH_MB3zEp4PVElfmSQDhbAMOitcvAEihkfFLZxRwjh4gzYgewamLNv-u9ugviIAyEAmDWffpoLXHnn5wpz_QaQuLLfeFrQoXgcQR2g5akX8EMF3aFVxCB3iursFqlRoSOFvh80_9xnI_XufDmu_AA0PdIiCvi9wljzhl8eMzs0x0nJ49wO1ZgSGN8c0pKjyc1eS8MCgFMAE&x-kcdn-pid=112781&Expires=1791574146&Signature=cTeRwnUl5Wy0gq9zKDCFqv5UrhMI4ODITJ7GBS80kQkIdWb7iFErJSK-XQ5yR6meZznCU9ywrHv70PiuK1IAR89usnI-nKkcxtDQdIB5Fe73Ggj-Zniux3v2KqefVKrPqEW3bnH5HdpPV4Dy9FqEpY9gbvWv4rRYtXYxjI5OC4VTsiZavNZwBLNos5-9QmTXsRDQ0ofsNpm3rk54aSmpfRMf2B0nv9TOGoQiiQ-eORSol7WJKb8vcV2g7LVaY8raksDNlQKZFa26d8B0~K8k8twPSb4Jx7Rl90d-eQgD3pdqKTFUfortJz92z35QbXxXZ9yxIBQwouIlB5mlHmZ4gg__&Key-Pair-Id=K1FG4T7LWJK0FU";

async function run() {
  const provider = new KlingFaceLipSyncProvider();
  const result = await provider.syncFace(beat1VideoUrl, "0", { path: audioPath, startMs: 0, endMs: 3500 }, 0);
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
