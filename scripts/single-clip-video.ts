/**
 * Driver for the 19 single_clip shots (dialogue short enough, or none at
 * all, to fit one generated clip -- no coverage_beats plan, unlike the
 * now-complete covered_sequence shots). Handles the 11 shots WITHOUT
 * needs_lip_sync in one pass: each just needs a real video clip from its
 * already-accepted keyframe via the same 3-tier fallback chain
 * (generateFinalVideoWithFallback) used throughout the covered_sequence
 * work, then assembleSingleShot to trim/normalize/mute it.
 *
 * The 8 needs_lip_sync single_clip shots are deliberately NOT handled
 * here -- each needs the same per-shot keyframe review (multi-face risk,
 * crop or face-targeting) already established for every lip-sync beat
 * this project has generated so far; see single-clip-lipsync-*.ts.
 *
 * Duration: these are standalone narrative/establishing beats with no
 * audio to size themselves against yet (stage 6's narration-timeline
 * placement is still a stub) -- 5s is a deliberate, moderate default
 * pacing choice, not derived from any per-shot timing data.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const db = getDb();
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
// 4s, not 5 -- every prior real Veo call this project has made used a
// duration that happened to land on 4 (the floor other beats clamped
// up to); a first attempt at 5s here was rejected outright ("durationSeconds
// is out of bound... between 4 and 8, inclusive" -- despite 5 being
// within that stated range), meaning Veo's real constraint is a discrete
// set of values, not a continuous range, and the error text doesn't say
// which. Falling back to the one value already confirmed to work.
const DEFAULT_DURATION_SEC = 4;

const videoProvider = new GeminiVideoProvider();
const klingSceneProvider = new KlingVideoProvider();
const draftProvider = new GeminiDraftVideoProvider();

interface ShotRow {
  id: string;
  sequence: number;
  scene_seq: number;
  action: string;
  verse_ref: string | null;
  keyframe_asset_path: string;
}

const insertAttempt = db.prepare(
  `INSERT INTO generation_attempts
     (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertCostEntry = db.prepare(`INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)`);
const insertClip = db.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)`);

// Per Dan's guidance (2026-09-09): start a Veo batch at 3 concurrent jobs
// rather than the fuller concurrency already confirmed safe for Kling --
// Veo's own rate limits haven't been tested under load yet, so this
// stays conservative until a batch completes cleanly.
const VEO_BATCH_CONCURRENCY = 3;

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

async function processShot(shot: ShotRow): Promise<void> {
  const existingClip = db.prepare(`SELECT id FROM clips WHERE shot_id = ?`).get(shot.id);
  if (existingClip) {
    console.log(`Scene ${shot.scene_seq} Shot ${shot.sequence} -- already has a clip, skipping.`);
    return;
  }
  if (!shot.keyframe_asset_path) {
    console.log(`Scene ${shot.scene_seq} Shot ${shot.sequence} -- NO accepted keyframe, skipping.`);
    return;
  }

  console.log(`Scene ${shot.scene_seq} Shot ${shot.sequence} (${shot.verse_ref}) -- generating...`);
  const result = await generateFinalVideoWithFallback(
    videoProvider,
    klingSceneProvider,
    draftProvider,
    { shotId: shot.id, prompt: `Static or subtly moving establishing shot. ${shot.action}`, characters: [] },
    { resolution: "720p", startFrame: { path: shot.keyframe_asset_path }, durationSeconds: DEFAULT_DURATION_SEC }
  );
  console.log(
    `  Scene ${shot.scene_seq} Shot ${shot.sequence} (tier: ${result.tier}, Veo attempts: ${result.veoAttempts}) -> ${result.status}, ${result.media?.path}, $${result.cost.usd}`
  );

  const attemptId = randomUUID();
  const now = Date.now();
  const operation = { veo: "generate_final", kling_scene: "generate_final", omni_draft: "generate_draft" }[result.tier];
  insertAttempt.run(attemptId, shot.id, result.provenance.provider, result.provenance.model, operation, "1280x720", result.provenance.prompt, result.status, result.media?.path ?? null, result.cost.usd, now);
  insertCostEntry.run(randomUUID(), projectId, attemptId, result.cost.usd, now);
  insertClip.run(randomUUID(), shot.id, attemptId, 0, DEFAULT_DURATION_SEC * 1000, now);

  const assembled = assembleSingleShot(db, shot.id);
  console.log(`  Scene ${shot.scene_seq} Shot ${shot.sequence} assembled -> ${assembled.assembledVideoPath}`);
}

async function run() {
  const shots = db
    .prepare(
      `SELECT s.id, s.sequence, sc.sequence as scene_seq, s.action, s.verse_ref,
              (SELECT ga.result_asset_path FROM generation_attempts ga WHERE ga.shot_id = s.id AND ga.operation = 'generate' AND ga.status = 'accepted' ORDER BY ga.created_at DESC LIMIT 1) as keyframe_asset_path
       FROM shots s JOIN scenes sc ON sc.id = s.scene_id
       WHERE s.coverage_plan = 'single_clip' AND s.needs_lip_sync = 0 AND sc.project_id = ?
       ORDER BY sc.sequence, s.sequence`
    )
    .all(projectId) as unknown as ShotRow[];

  console.log(`${shots.length} non-lip-sync single_clip shot(s) to process, ${VEO_BATCH_CONCURRENCY} at a time.\n`);

  await runWithConcurrency(
    shots.map((shot) => () => processShot(shot).catch((err) => console.error(`  Scene ${shot.scene_seq} Shot ${shot.sequence} FAILED:`, err))),
    VEO_BATCH_CONCURRENCY
  );

  console.log("\ndone.");
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
