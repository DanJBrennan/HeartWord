/**
 * Generates Scene 3 Shot 5's beats 2-8 (everything except beat 1's
 * master, handled separately since it needs a manual face_id
 * confirmation step). See build notes: beat 2 (the shot's own reused
 * keyframe) has two sharp forward-facing bystanders and is cropped;
 * beats 4, 6, 8's own keyframes are already clean single-speaker
 * close-ups; beats 3, 5, 7 are silent reaction cutaways.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingLipSyncProvider, KlingVideoProvider } from "../src/providers/kling/index.js";
import { cropKeyframe } from "../src/pipeline/media-generation/crop-keyframe.js";

const db = getDb();
const dataDir = getDataDir();
const shotId = "44009342-73b8-4b8a-ad46-085d64253258";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/18-mark-2-21-elevenlabs.mp3";
const JESUS_CHARACTER_ID = "b78bed54-1d53-4b9f-9070-549dddb71b19";

const insertAttempt = db.prepare(
  `INSERT INTO generation_attempts
     (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertCostEntry = db.prepare(`INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)`);
const insertClip = db.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)`);

function record(provider: string, model: string, operation: string, result: any, startMs: number, endMs: number) {
  const attemptId = randomUUID();
  const now = Date.now();
  insertAttempt.run(attemptId, shotId, provider, model, operation, "1280x720", result.provenance?.prompt ?? null, result.status, result.media?.path ?? null, result.cost.usd, now);
  insertCostEntry.run(randomUUID(), projectId, attemptId, result.cost.usd, now);
  insertClip.run(randomUUID(), shotId, attemptId, startMs, endMs, now);
}

async function run() {
  const avatarProvider = new KlingLipSyncProvider();
  const sceneProvider = new KlingVideoProvider();

  const jesusRow = db
    .prepare(`SELECT c.id AS characterId, cv.id AS characterVersionId FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved' WHERE c.id = ?`)
    .get(JESUS_CHARACTER_ID) as { characterId: string; characterVersionId: string };

  // Beat 2: lip_sync_insert, crop the shot's own keyframe (two sharp bystanders present)
  const shotKeyframe = db
    .prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`)
    .get(shotId) as { result_asset_path: string };
  const croppedRel = join("generated", "keyframes", "cropped", "44009342-beat2.png");
  cropKeyframe(join(dataDir, "assets", shotKeyframe.result_asset_path), { x: 460, y: 20, width: 750, height: 422 }, join(dataDir, "assets", croppedRel));
  console.log("Beat 2: Avatar lip-sync (cropped)...");
  const beat2Result = await avatarProvider.sync(jesusRow, { path: audioPath, startMs: 3500, endMs: 9211 }, { path: croppedRel });
  console.log(`  -> ${beat2Result.status}, ${beat2Result.media?.path}, $${beat2Result.cost.usd}`);
  record("kling", "avatar-image2video", "lip_sync", beat2Result, 3500, 9211);

  // Beat 3: cutaway, no dialogue
  const beat3 = db.prepare(`SELECT * FROM coverage_beats WHERE id = '5fa545f6-6422-41da-85f0-c6f1f867c99f'`).get() as any;
  console.log("Beat 3: cutaway scene generation...");
  const beat3Result = await sceneProvider.generateFinal(
    { shotId: `${shotId}-beat3`, prompt: "Static close reaction shot on two listeners examining a torn cloth patch, thoughtful expressions, mouths closed. No camera movement.", characters: [] },
    { resolution: "720p", startFrame: { path: beat3.keyframe_asset_path } }
  );
  console.log(`  -> ${beat3Result.status}, ${beat3Result.media?.path}, $${beat3Result.cost.usd}`);
  record("kling", beat3Result.provenance.model, "generate_final", beat3Result, 9211, 12211);

  // Beat 4: lip_sync_insert, own keyframe already clean
  const beat4 = db.prepare(`SELECT * FROM coverage_beats WHERE id = 'c8b3c795-d136-4b3f-b838-0c86d4503c78'`).get() as any;
  console.log("Beat 4: Avatar lip-sync...");
  const beat4Result = await avatarProvider.sync(jesusRow, { path: audioPath, startMs: 12211, endMs: 17921 }, { path: beat4.keyframe_asset_path });
  console.log(`  -> ${beat4Result.status}, ${beat4Result.media?.path}, $${beat4Result.cost.usd}`);
  record("kling", "avatar-image2video", "lip_sync", beat4Result, 12211, 17921);

  // Beat 5: cutaway, no dialogue
  const beat5 = db.prepare(`SELECT * FROM coverage_beats WHERE id = 'db7aa0de-987a-4cb5-aaab-3758da616627'`).get() as any;
  console.log("Beat 5: cutaway scene generation...");
  const beat5Result = await sceneProvider.generateFinal(
    { shotId: `${shotId}-beat5`, prompt: "Static close reaction shot on listeners in the crowd, attentive, mouths closed. No camera movement.", characters: [] },
    { resolution: "720p", startFrame: { path: beat5.keyframe_asset_path } }
  );
  console.log(`  -> ${beat5Result.status}, ${beat5Result.media?.path}, $${beat5Result.cost.usd}`);
  record("kling", beat5Result.provenance.model, "generate_final", beat5Result, 17921, 20921);

  // Beat 6: lip_sync_insert, own keyframe already clean
  const beat6 = db.prepare(`SELECT * FROM coverage_beats WHERE id = 'd8d88a92-7927-491a-b282-63184463e8b5'`).get() as any;
  console.log("Beat 6: Avatar lip-sync...");
  const beat6Result = await avatarProvider.sync(jesusRow, { path: audioPath, startMs: 20921, endMs: 26631 }, { path: beat6.keyframe_asset_path });
  console.log(`  -> ${beat6Result.status}, ${beat6Result.media?.path}, $${beat6Result.cost.usd}`);
  record("kling", "avatar-image2video", "lip_sync", beat6Result, 20921, 26631);

  // Beat 7: cutaway, no dialogue
  const beat7 = db.prepare(`SELECT * FROM coverage_beats WHERE id = 'cbb60d23-f194-4c43-ae44-10cdbddc4e4b'`).get() as any;
  console.log("Beat 7: cutaway scene generation...");
  const beat7Result = await sceneProvider.generateFinal(
    { shotId: `${shotId}-beat7`, prompt: "Static reaction shot on seated listeners from behind/side, attentive, mouths closed, Jesus small in the distance. No camera movement.", characters: [] },
    { resolution: "720p", startFrame: { path: beat7.keyframe_asset_path } }
  );
  console.log(`  -> ${beat7Result.status}, ${beat7Result.media?.path}, $${beat7Result.cost.usd}`);
  record("kling", beat7Result.provenance.model, "generate_final", beat7Result, 26631, 29631);

  // Beat 8: lip_sync_insert, own keyframe already clean
  const beat8 = db.prepare(`SELECT * FROM coverage_beats WHERE id = '6a6a1657-8310-4a48-905c-4261c1acda05'`).get() as any;
  console.log("Beat 8: Avatar lip-sync...");
  const beat8Result = await avatarProvider.sync(jesusRow, { path: audioPath, startMs: 29631, endMs: 35341 }, { path: beat8.keyframe_asset_path });
  console.log(`  -> ${beat8Result.status}, ${beat8Result.media?.path}, $${beat8Result.cost.usd}`);
  record("kling", "avatar-image2video", "lip_sync", beat8Result, 29631, 35341);

  console.log("done.");
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
