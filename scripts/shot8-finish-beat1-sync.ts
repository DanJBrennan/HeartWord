/**
 * Completes shot8-redo-master-cutaway.ts's beat 1 fix: face_id "0" was
 * visually confirmed as Jesus against the real thumbnail (see that
 * script's output), so run the actual audio-driven face lip-sync now.
 *
 * Beat 3 does NOT need this step -- its fresh Kling scene render already
 * shows Jesus genuinely soft-focus (confirmed by direct pixel zoom, and
 * by identify-face failing to even detect his face among the 4 it
 * found), so his mouth stillness isn't perceptible. That beat uses its
 * new Kling scene video as-is.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const shotId = "ea5e2ff9-c321-41f2-9c80-fd856c05d78d";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/05-mark-2-10-11-elevenlabs.mp3";

const beat1VideoUrl =
  "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/5d1131bec246d4705f4afdc8aff3ee94-1eea6345-bdff-4802-8921-97d44ac58d8c.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAHPICI19_3cSWyu8KGqBAfaVlmRW8S_ZpZsAgEZu_NX27ta9m2kZeyuxr2lva1VimuJb-QNhtAHF-wPkpSe6pKjkwoNjOsBzj6tCaybfJH0fxVHExLnm_qb6apzAZPBK1d--L2Re3-f6dC_w_WCczuWhMmYoVwa7RVXxTohF2_1LsN5r7E_QGbGMYFpufPJZLBs1l7A15Kubvlcwfve9379m2QM4TQqEusx31P13D22WxoSk8Q9wF5iLa3FHD-a4yQLv8RpIiC_Ku4nkbACSaMigKoq7GBIX1DcZDU0SGkAM7mvV8VAuCgFMAE&x-kcdn-pid=112781&Expires=1791567249&Signature=JU3rBEww7Kno6HQSgi8IrQXv0yaJ2~X33-3IRmLkwAr3zZrw70cP683UHBMpZXokwP~3N8GvuZ79i-jfs73uNDcsCaksRdEuPx7eH6HvawRT2aldIND7r3ugmlMwJ0gAr9fUmPUhOHTh9BneQZxWd0iI2~nBDk0GHHEVgmTXFwTOQzWd74oMH3NgYrAxUnZg-2TNnThkHZ4pzUuedQF0Tt9kwFTDABc2NOWWyRnTWPuNhqpw~XiFB7Q5QvFXEmqigx7hLp19xKGPhfHRCP9tBaxtYKRDPBNIVfv3O13Zl9YlMPIKLNi3g0hassftbCLs9dNagZJ1cz5CZZsy1-3irg__&Key-Pair-Id=K1FG4T7LWJK0FU";

async function run() {
  const provider = new KlingFaceLipSyncProvider();
  const result = await provider.syncFace(beat1VideoUrl, "0", { path: audioPath, startMs: 0, endMs: 3500 }, 0);
  console.log(`beat 1 -> ${result.status}, ${result.media?.path}, $${result.cost.usd}`);

  // Replace beat 1's prior (Veo) generation_attempts/clips row.
  const old = db
    .prepare(`SELECT cl.id, cl.generation_attempt_id FROM clips cl WHERE cl.shot_id = ? AND cl.timeline_start_ms = 0 AND cl.timeline_end_ms = 3500`)
    .get(shotId) as { id: string; generation_attempt_id: string } | undefined;
  if (old) {
    db.prepare(`DELETE FROM clips WHERE id = ?`).run(old.id);
    db.prepare(`DELETE FROM cost_ledger_entries WHERE generation_attempt_id = ?`).run(old.generation_attempt_id);
    db.prepare(`DELETE FROM generation_attempts WHERE id = ?`).run(old.generation_attempt_id);
    console.log("removed prior beat 1 clip/attempt");
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
  db.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, 0, 3500, ?)`).run(
    randomUUID(),
    shotId,
    attemptId,
    now
  );
  console.log("beat 1 clip row inserted");
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
