/**
 * Generates Scene 3 Shot 6's beats 2-8 (everything except beat 1's
 * master). Unlike earlier shots' fully-sequential scripts, these 7
 * independent generations run concurrently (capped at 4 in flight,
 * under the account's confirmed 5-concurrent-generation limit) --
 * each beat's own DB write happens right when its own call resolves,
 * so a partial failure doesn't lose the beats that already finished.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingLipSyncProvider, KlingVideoProvider } from "../src/providers/kling/index.js";
import { cropKeyframe } from "../src/pipeline/media-generation/crop-keyframe.js";

const db = getDb();
const dataDir = getDataDir();
const shotId = "8209a47b-eaa0-4dcd-9a43-e3a9afd2e369";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/19-mark-2-22-elevenlabs.mp3";
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

// Small hand-rolled concurrency limiter -- no new dependency needed for
// something this simple.
async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      await tasks[i]!();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
}

async function run() {
  const avatarProvider = new KlingLipSyncProvider();
  const sceneProvider = new KlingVideoProvider();

  const jesusRow = db
    .prepare(`SELECT c.id AS characterId, cv.id AS characterVersionId FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved' WHERE c.id = ?`)
    .get(JESUS_CHARACTER_ID) as { characterId: string; characterVersionId: string };

  const shotKeyframe = db
    .prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`)
    .get(shotId) as { result_asset_path: string };
  const beat2CroppedRel = join("generated", "keyframes", "cropped", "8209a47b-beat2.png");
  cropKeyframe(join(dataDir, "assets", shotKeyframe.result_asset_path), { x: 480, y: 20, width: 700, height: 394 }, join(dataDir, "assets", beat2CroppedRel));

  const beat4 = db.prepare(`SELECT * FROM coverage_beats WHERE id = 'db810db8-2ac0-4272-a507-2774a10c9bf2'`).get() as any;
  const beat4CroppedRel = join("generated", "keyframes", "cropped", "8209a47b-beat4.png");
  cropKeyframe(join(dataDir, "assets", beat4.keyframe_asset_path), { x: 400, y: 0, width: 850, height: 478 }, join(dataDir, "assets", beat4CroppedRel));

  const beat6 = db.prepare(`SELECT * FROM coverage_beats WHERE id = 'c06a7d62-6c15-4845-add3-37df451abf74'`).get() as any;
  const beat6CroppedRel = join("generated", "keyframes", "cropped", "8209a47b-beat6.png");
  cropKeyframe(join(dataDir, "assets", beat6.keyframe_asset_path), { x: 100, y: 20, width: 850, height: 478 }, join(dataDir, "assets", beat6CroppedRel));

  const beat3 = db.prepare(`SELECT * FROM coverage_beats WHERE id = '131431ee-b918-46d5-a6eb-2807d0f1775a'`).get() as any;
  const beat5 = db.prepare(`SELECT * FROM coverage_beats WHERE id = '5e7bb355-5565-4d2b-b2d2-f375c17c67de'`).get() as any;
  const beat7 = db.prepare(`SELECT * FROM coverage_beats WHERE id = 'd524da8d-c111-4d55-a792-dc919e0e0b4b'`).get() as any;
  const beat8 = db.prepare(`SELECT * FROM coverage_beats WHERE id = '2c030afd-9100-4eb6-89e6-6931bd99d3b0'`).get() as any;

  const tasks: Array<() => Promise<void>> = [
    async () => {
      console.log("Beat 2: Avatar lip-sync (cropped)...");
      const r = await avatarProvider.sync(jesusRow, { path: audioPath, startMs: 3500, endMs: 8479 }, { path: beat2CroppedRel });
      console.log(`  beat 2 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", "avatar-image2video", "lip_sync", r, 3500, 8479);
    },
    async () => {
      console.log("Beat 3: cutaway scene generation...");
      const r = await sceneProvider.generateFinal(
        { shotId: `${shotId}-beat3`, prompt: "Static reaction shot on listeners examining a wineskin, thoughtful expressions, mouths closed, Jesus small in the background. No camera movement.", characters: [] },
        { resolution: "720p", startFrame: { path: beat3.keyframe_asset_path } }
      );
      console.log(`  beat 3 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", r.provenance.model, "generate_final", r, 8479, 11479);
    },
    async () => {
      console.log("Beat 4: Avatar lip-sync (cropped)...");
      const r = await avatarProvider.sync(jesusRow, { path: audioPath, startMs: 11479, endMs: 16458 }, { path: beat4CroppedRel });
      console.log(`  beat 4 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", "avatar-image2video", "lip_sync", r, 11479, 16458);
    },
    async () => {
      console.log("Beat 5: cutaway scene generation...");
      const r = await sceneProvider.generateFinal(
        { shotId: `${shotId}-beat5`, prompt: "Static reaction shot on listeners in the crowd, attentive, mouths closed, Jesus small in the background. No camera movement.", characters: [] },
        { resolution: "720p", startFrame: { path: beat5.keyframe_asset_path } }
      );
      console.log(`  beat 5 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", r.provenance.model, "generate_final", r, 16458, 19458);
    },
    async () => {
      console.log("Beat 6: Avatar lip-sync (cropped)...");
      const r = await avatarProvider.sync(jesusRow, { path: audioPath, startMs: 19458, endMs: 24437 }, { path: beat6CroppedRel });
      console.log(`  beat 6 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", "avatar-image2video", "lip_sync", r, 19458, 24437);
    },
    async () => {
      console.log("Beat 7: cutaway scene generation...");
      const r = await sceneProvider.generateFinal(
        { shotId: `${shotId}-beat7`, prompt: "Static reaction shot on seated listeners from behind/side, attentive, mouths closed, Jesus small in the distance. No camera movement.", characters: [] },
        { resolution: "720p", startFrame: { path: beat7.keyframe_asset_path } }
      );
      console.log(`  beat 7 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", r.provenance.model, "generate_final", r, 24437, 27437);
    },
    async () => {
      console.log("Beat 8: Avatar lip-sync...");
      const r = await avatarProvider.sync(jesusRow, { path: audioPath, startMs: 27437, endMs: 32415 }, { path: beat8.keyframe_asset_path });
      console.log(`  beat 8 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", "avatar-image2video", "lip_sync", r, 27437, 32415);
    }
  ];

  await runWithConcurrency(tasks, 4);
  console.log("done.");
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
