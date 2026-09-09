/**
 * Generates Scene 4 Shot 2's beats 2-4 (everything except beat 1's
 * master). Beat 2 (shot's own reused keyframe) and beat 4 (its own new
 * keyframe) both have several sharp forward-facing bystanders (this is
 * a crowded 5-6 person scene) -- both cropped tight on the Principal
 * scribe. Beat 3 is a silent reaction cutaway, no dialogue.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingLipSyncProvider, KlingVideoProvider } from "../src/providers/kling/index.js";
import { cropKeyframe } from "../src/pipeline/media-generation/crop-keyframe.js";

const db = getDb();
const dataDir = getDataDir();
const shotId = "94a721a3-1fc6-44d1-a9e2-9021e26ec408";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/21-mark-2-24-elevenlabs.mp3";
const SCRIBE_CHARACTER_ID = "3a50ba1f-955f-47ef-80ab-deeec15de742";

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

  const scribeRow = db
    .prepare(`SELECT c.id AS characterId, cv.id AS characterVersionId FROM characters c JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved' WHERE c.id = ?`)
    .get(SCRIBE_CHARACTER_ID) as { characterId: string; characterVersionId: string };

  const shotKeyframe = db
    .prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`)
    .get(shotId) as { result_asset_path: string };
  const beat2CroppedRel = join("generated", "keyframes", "cropped", "94a721a3-beat2.png");
  cropKeyframe(join(dataDir, "assets", shotKeyframe.result_asset_path), { x: 250, y: 80, width: 500, height: 281 }, join(dataDir, "assets", beat2CroppedRel));

  const beat4 = db.prepare(`SELECT * FROM coverage_beats WHERE id = '3e585562-61b9-44f5-b3aa-928f70e1e720'`).get() as any;
  const beat4CroppedRel = join("generated", "keyframes", "cropped", "94a721a3-beat4.png");
  cropKeyframe(join(dataDir, "assets", beat4.keyframe_asset_path), { x: 280, y: 40, width: 650, height: 365 }, join(dataDir, "assets", beat4CroppedRel));

  const beat3 = db.prepare(`SELECT * FROM coverage_beats WHERE id = 'b19b6263-f5eb-4b97-bf57-da2def608407'`).get() as any;

  const tasks: Array<() => Promise<void>> = [
    async () => {
      console.log("Beat 2: Avatar lip-sync (cropped)...");
      const r = await avatarProvider.sync(scribeRow, { path: audioPath, startMs: 3500, endMs: 7402 }, { path: beat2CroppedRel });
      console.log(`  beat 2 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", "avatar-image2video", "lip_sync", r, 3500, 7402);
    },
    async () => {
      console.log("Beat 3: cutaway scene generation...");
      const r = await sceneProvider.generateFinal(
        { shotId: `${shotId}-beat3`, prompt: "Static reaction shot on two scribes in a wheat field, disapproving expressions, mouths closed. No camera movement.", characters: [] },
        { resolution: "720p", startFrame: { path: beat3.keyframe_asset_path } }
      );
      console.log(`  beat 3 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", r.provenance.model, "generate_final", r, 7402, 10402);
    },
    async () => {
      console.log("Beat 4: Avatar lip-sync (cropped)...");
      const r = await avatarProvider.sync(scribeRow, { path: audioPath, startMs: 10402, endMs: 14303 }, { path: beat4CroppedRel });
      console.log(`  beat 4 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", "avatar-image2video", "lip_sync", r, 10402, 14303);
    }
  ];

  await runWithConcurrency(tasks, 3);
  console.log("done.");
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
