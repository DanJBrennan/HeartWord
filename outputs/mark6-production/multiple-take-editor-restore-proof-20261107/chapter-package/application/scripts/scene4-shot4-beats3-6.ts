/**
 * Scene 4 Shot 4's beats 3-6: two silent cutaways and two clean
 * single-speaker lip-sync inserts (their own keyframes have no other
 * visible faces). Runs all 4 independent generations concurrently.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { KlingLipSyncProvider, KlingVideoProvider } from "../src/providers/kling/index.js";

const db = getDb();
const shotId = "96199814-0884-4a4a-bd95-b84950fce4fd";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const audioPath = "generated/hatam/mark-2/composite_cast_master/23-mark-2-27-28-elevenlabs.mp3";
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

  const beat3 = db.prepare(`SELECT * FROM coverage_beats WHERE id = 'cf4e340e-adde-4e1e-a599-4d1e4a6b3ff6'`).get() as any;
  const beat4 = db.prepare(`SELECT * FROM coverage_beats WHERE id = '0b1b40f4-49ca-4e86-b959-59e74e0d9994'`).get() as any;
  const beat5 = db.prepare(`SELECT * FROM coverage_beats WHERE id = '07c1fd45-59d2-447f-bf56-efdea037495f'`).get() as any;
  const beat6 = db.prepare(`SELECT * FROM coverage_beats WHERE id = 'ecf0b8fc-e900-496d-b8dd-243dcbaf2e61'`).get() as any;

  const results = await Promise.allSettled([
    (async () => {
      console.log("Beat 3: cutaway scene generation...");
      const r = await sceneProvider.generateFinal(
        { shotId: `${shotId}-beat3`, prompt: "Static reaction shot on two scribes in a wheat field, listening thoughtfully, mouths closed. No camera movement.", characters: [] },
        { resolution: "720p", startFrame: { path: beat3.keyframe_asset_path } }
      );
      console.log(`  beat 3 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", r.provenance.model, "generate_final", r, 7315, 10315);
    })(),
    (async () => {
      console.log("Beat 4: Avatar lip-sync...");
      const r = await avatarProvider.sync(jesusRow, { path: audioPath, startMs: 10315, endMs: 14130 }, { path: beat4.keyframe_asset_path });
      console.log(`  beat 4 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", "avatar-image2video", "lip_sync", r, 10315, 14130);
    })(),
    (async () => {
      console.log("Beat 5: cutaway scene generation...");
      const r = await sceneProvider.generateFinal(
        { shotId: `${shotId}-beat5`, prompt: "Static reaction shot on two scribes standing in a wheat field by a lake, listening thoughtfully, mouths closed. No camera movement.", characters: [] },
        { resolution: "720p", startFrame: { path: beat5.keyframe_asset_path } }
      );
      console.log(`  beat 5 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", r.provenance.model, "generate_final", r, 14130, 17130);
    })(),
    (async () => {
      console.log("Beat 6: Avatar lip-sync...");
      const r = await avatarProvider.sync(jesusRow, { path: audioPath, startMs: 17130, endMs: 20944 }, { path: beat6.keyframe_asset_path });
      console.log(`  beat 6 -> ${r.status}, ${r.media?.path}, $${r.cost.usd}`);
      record("kling", "avatar-image2video", "lip_sync", r, 17130, 20944);
    })()
  ]);

  for (const r of results) {
    if (r.status === "rejected") console.error("A task failed:", r.reason);
  }
  console.log("done.");
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
