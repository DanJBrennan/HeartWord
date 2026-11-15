/**
 * Finishes Scene 1 Shots 5 and 10's lip-sync (face_id "0" confirmed for
 * both against their real thumbnails). Shot 6 is deliberately NOT
 * included -- its verse (Mark 2:6-7) has NO composite_cast_master audio
 * row at all (the scribes' "questioning in their hearts" was never
 * voiced), so needs_lip_sync=1 on that shot can't actually be
 * fulfilled; flagging this rather than guessing.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const db = getDb();
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";

const jobs = [
  {
    shotId: "445d00de-7f66-494d-a104-d3e927d5dbdd",
    videoUrl:
      "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/47f2f4fbbf89f0b717fa49e1190c8a7f-704a6e29-6060-4fce-9211-17122808a963.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAH1uDchhf7FYYa9EGSVTc8vZUxfVZAr-y43rreoRfN4rCV3VYkpRgWtlcpxzXCPLnmUkd35Jl1b7Zxzcosu_TAr5l0tvDYBy060-_A9ezUoC8TS7aWX7FgLaOSgFOEe_8ste92gO4wVluHxf7h2IqVD_fVvbkTG4PaMOcN3ylqDWn0gcw_AqZ0kaBAlzeOYDLt98RMWT6I7RlbEM8q3Y4IEx0o8V-uqOdWHzPpV3q-9AxoS0TR4h_eyjkvDOmDeFijUb3cSIiBoaVuHue44mGui-q_JaC3LQmq0JtLwbiEpnSvmOtlhmygFMAE&x-kcdn-pid=112781&Expires=1791585391&Signature=tit3vW~TEcf4MrhsfMGPk9NiX27~IpsTxCiJ488rxZNO1o-KoiQIHsHrI04nDJWuce0gcQDuQVlvmc65nUNHMUppbkKx6Q46MtuJhiyEuDx4tnS61mIbVwUSxRMdnThZ1Lee1ISg8CilHJP5x0Szw80AZj97KHpQxiIPql0u3pqm5IhXQLWmePcGfOsHa3ZHRMqORpQaQiq~69WMA9bHZnpiLAoHJy1x8YMlepDBqXvCsXPrFLLfkr8weI5CkYdDXlA7d1n4V2lH56f3P8-fPqKgDPrntJSV-V9IBVEbpFbB5fAGZ2nbhukEAXPI9O6Qb5BedcTn7RAUD2WFIltImA__&Key-Pair-Id=K1FG4T7LWJK0FU",
    faceId: "0"
  },
  {
    shotId: "27416798-3186-468a-978d-35b74297ea2f",
    videoUrl:
      "https://v15-kling-fdl.klingai.com/bs2/upload-ylab-stunt-sgp/muse/912938483847659560/VIDEO/20260910/1ec7794ca61be37de35a6114ff79d6fd-2b45a15f-17a3-49fb-a3db-69f674a77ddd.mp4?cacheKey=ChtzZWN1cml0eS5rbGluZy5tZXRhX2VuY3J5cHQSsAFpgVucaap2ui83XgELsLBjCjbJKjkre2D_yS5579FNcygkJQd4Fa-1tyl5lBDKX1Da8QkOxU8528lPM03pSYqPTiqnDfi9vXov8Z2C61m0CBhxdjq2WDLDC8jHGJkTfnPG5CU3LZejTrRVx0MPFs_BcuyAE2D-ANCrJl4FbvZvkV26bkQYFlqRC6pcwGOH3ELeuyCFOlzArdJtEP6Y_yesrLJ4aeKBNuWmAtUAyc_G5hoSxWNjcgh9zqt_zDfpYBGATs3tIiBSb53Z4EvlxARZxREm_cpGk5GXHPq9BcJZVv14V7rpAigFMAE&x-kcdn-pid=112781&Expires=1791585272&Signature=KBezwwHwHs8teYTCDi4TqDACQvOyMGvy1wO3j1-nY5qdykfbkcjvKIecsCuMsNJx7L2bRnPUEFUdXZCwRULuBoLGz2HNOh4Qa~MCxezkVKyymgW0-SW-GhyH4v3biXGepgbH5QlFh9Rpg6lJOcfR8WOeelzbXAzhCu2WA9oC-59TfgHfgmVK8dJuYxZC7WSp8On5q86jOiagH~i8PMU9sbNorcA7IMQYZXQ~EyPtoXQi4rwmPaVxPjfIBhHrTfETxWj1XAZf~qvuW~c39vtLx19N-egy8t95WvL8rtQ~sNqShoXh3ZHYWPUIylLNPzebHDSEd1x-ixnUYPXYZ3EASQ__&Key-Pair-Id=K1FG4T7LWJK0FU",
    faceId: "0"
  }
];

async function run() {
  const provider = new KlingFaceLipSyncProvider();
  for (const job of jobs) {
    const shot = db.prepare(`SELECT verse_ref, dialogue_character_id FROM shots WHERE id = ?`).get(job.shotId) as any;
    // Approximate audio duration for the face-lipsync request -- real
    // trim to the shot's own composite_cast_master duration happens in
    // assembleSingleShot, this is just how much of the source clip to
    // sync against.
    const audioRow = db
      .prepare(`SELECT source_path, start_ms, end_ms FROM audio_segments WHERE layer='composite_cast_master' AND verse_ref = ?`)
      .get(shot.verse_ref) as any;

    const result = await provider.syncFace(job.videoUrl, job.faceId, { path: audioRow.source_path, startMs: audioRow.start_ms, endMs: audioRow.end_ms }, 0);
    console.log(`${job.shotId} -> ${result.status}, ${result.media?.path}, $${result.cost.usd}`);

    const attemptId = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO generation_attempts (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
       VALUES (?, ?, 'kling', 'lip-sync-audio2video', 'lip_sync', '1280x720', NULL, ?, ?, ?, ?)`
    ).run(attemptId, job.shotId, result.status, result.media?.path ?? null, result.cost.usd, now);
    db.prepare(`INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      randomUUID(), projectId, attemptId, result.cost.usd, now
    );
    const durationMs = audioRow.end_ms - audioRow.start_ms;
    db.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, 0, ?, ?)`).run(
      randomUUID(), job.shotId, attemptId, durationMs, now
    );

    const assembled = assembleSingleShot(db, job.shotId);
    console.log(`  assembled -> ${assembled.assembledVideoPath} (hasDialogueAudio=${assembled.hasDialogueAudio})`);
  }
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
