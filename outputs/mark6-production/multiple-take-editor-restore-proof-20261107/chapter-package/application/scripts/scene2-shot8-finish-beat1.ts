import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const shotId = "cb1856ec-2e9f-4ba7-804c-a758da8c20d5";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/12-mark-2-17-elevenlabs.mp3";

const beat1VideoUrl =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/54a81aa1d3e54c338964d36f408f5c00-6c45a50e-3e65-45f7-bcb7-95d728fb342c.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAE9T8rvDBoE8uPJAFElf9adVE_NGRwVmPN5DYn9s5N1Pp59OoFlMq9z_FNmHx7J2GHpEQoAObd2wTkqYKpNinaFkAexlOjIUMdO1KC2Fcm6fFtqI8NlajkAWT54u3Ipl2HmIjOL604pP5QMp-YOy_IblLBB6rk2LpUbr8IsewaaNklmm1vZ7ciJRhgbo-z3PgRnSnBF0iYFzEB_N_s-HhuuNjTBFI7vWDmANZCVJ4933hoS09j_LL38Qv8Yv5Zh0thEYW8BIiAdGKajAw7YaEoHVdAbUwke8X7lHvP6oi9YfXfI6Xb4_SgFMAE&x-kcdn-pid=112781&Expires=1791572326&Signature=E07neAUHyPhPk9HFUxqmc--Qetz8qINgnQwDy9OmvMiCjtnxurn7KrbqhXH9jydQDbJe9to-1JwF-dR0uwDlOWvxrYNJGRXf1OEac-SmDpDboHuzdwNa1UZvJN~N7OiNjTh32kMcH6g68lQ5YXwRe3CZ5wgKQAOGlU2GeoPPPnOIoPlIM0HYU4MXYsiySmGpuT92~jO48RZ53FKsiOC34-C55flyaXGSsJpfE15gU-jh6qflCD2aiHHvGMIwRA5UgLSlPYMiL1mKJePXEycSNYDOwQTT5l1yWM85LW5SMwjR9MYP-AeRgHrYF0r8pvXdtujOq1BEXjqFETsgPXmxJQ__&Key-Pair-Id=K1FG4T7LWJK0FU";

async function run() {
  const provider = new KlingFaceLipSyncProvider();
  const result = await provider.syncFace(beat1VideoUrl, "2", { path: audioPath, startMs: 0, endMs: 3500 }, 0);
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
