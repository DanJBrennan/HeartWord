/**
 * Generates Scene 2 Shot 8's beats 2-6 (everything except beat 1's
 * master, handled separately in scene2-shot8-video.ts since it needs a
 * manual face_id confirmation step). See that file's header for the
 * overall per-beat plan.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingLipSyncProvider, KlingVideoProvider } from "../src/providers/kling/index.js";
import { cropKeyframe } from "../src/pipeline/media-generation/crop-keyframe.js";

const db = getDb();
const dataDir = getDataDir();
const shotId = "cb1856ec-2e9f-4ba7-804c-a758da8c20d5";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/12-mark-2-17-elevenlabs.mp3";
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
  const db2 = db;

  // Need the real character_version_id for Jesus
  const jesusRow = db2
    .prepare(`SELECT c.id AS characterId, cv.id AS characterVersionId FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved' WHERE c.id = ?`)
    .get(JESUS_CHARACTER_ID) as { characterId: string; characterVersionId: string };

  // Beat 2: lip_sync_insert, crop the shot's own keyframe to exclude the sharp doorway scribe
  const shotKeyframe = db2
    .prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`)
    .get(shotId) as { result_asset_path: string };
  const sourceAbs = join(dataDir, "assets", shotKeyframe.result_asset_path);
  const croppedRel = join("generated", "keyframes", "cropped", "cb1856ec-beat2.png");
  cropKeyframe(sourceAbs, { x: 480, y: 100, width: 750, height: 422 }, join(dataDir, "assets", croppedRel));
  console.log("Beat 2: Avatar lip-sync (cropped)...");
  const beat2Result = await avatarProvider.sync(jesusRow, { path: audioPath, startMs: 3500, endMs: 7795 }, { path: croppedRel });
  console.log(`  -> ${beat2Result.status}, ${beat2Result.media?.path}, $${beat2Result.cost.usd}`);
  record("kling", "avatar-image2video", "lip_sync", beat2Result, 3500, 7795);

  // Beat 3: cutaway, no dialogue -- plain scene generation
  const beat3 = db2.prepare(`SELECT * FROM coverage_beats WHERE id = 'a60de7c6-8dc9-40ad-8db3-2e90871f9ecd'`).get() as any;
  console.log("Beat 3: cutaway scene generation...");
  const beat3Result = await sceneProvider.generateFinal(
    { shotId: `${shotId}-beat3`, prompt: "Static close reaction shot on the scribe's face, listening with a skeptical, disapproving expression, mouth closed. No camera movement.", characters: [] },
    { resolution: "720p", startFrame: { path: beat3.keyframe_asset_path } }
  );
  console.log(`  -> ${beat3Result.status}, ${beat3Result.media?.path}, $${beat3Result.cost.usd}`);
  record("kling", beat3Result.provenance.model, "generate_final", beat3Result, 7795, 10795);

  // Beat 4: lip_sync_insert, own keyframe already clean (single sharp face)
  const beat4 = db2.prepare(`SELECT * FROM coverage_beats WHERE id = '239b6c10-a2fa-4623-9532-5224eb7ebc43'`).get() as any;
  console.log("Beat 4: Avatar lip-sync...");
  const beat4Result = await avatarProvider.sync(jesusRow, { path: audioPath, startMs: 10795, endMs: 15090 }, { path: beat4.keyframe_asset_path });
  console.log(`  -> ${beat4Result.status}, ${beat4Result.media?.path}, $${beat4Result.cost.usd}`);
  record("kling", "avatar-image2video", "lip_sync", beat4Result, 10795, 15090);

  // Beat 5: cutaway, no dialogue -- plain scene generation
  const beat5 = db2.prepare(`SELECT * FROM coverage_beats WHERE id = '182f33d4-5498-4443-8eab-95e7d03ef995'`).get() as any;
  console.log("Beat 5: cutaway scene generation...");
  const beat5Result = await sceneProvider.generateFinal(
    { shotId: `${shotId}-beat5`, prompt: "Static close reaction shot on a disciple's face, listening thoughtfully, mouth closed. No camera movement.", characters: [] },
    { resolution: "720p", startFrame: { path: beat5.keyframe_asset_path } }
  );
  console.log(`  -> ${beat5Result.status}, ${beat5Result.media?.path}, $${beat5Result.cost.usd}`);
  record("kling", beat5Result.provenance.model, "generate_final", beat5Result, 15090, 18090);

  // Beat 6: lip_sync_insert, own keyframe already clean
  const beat6 = db2.prepare(`SELECT * FROM coverage_beats WHERE id = '47464ffa-6461-4618-9880-fdd0fb88e2ac'`).get() as any;
  console.log("Beat 6: Avatar lip-sync...");
  const beat6Result = await avatarProvider.sync(jesusRow, { path: audioPath, startMs: 18090, endMs: 22384 }, { path: beat6.keyframe_asset_path });
  console.log(`  -> ${beat6Result.status}, ${beat6Result.media?.path}, $${beat6Result.cost.usd}`);
  record("kling", "avatar-image2video", "lip_sync", beat6Result, 18090, 22384);

  console.log("done.");
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
