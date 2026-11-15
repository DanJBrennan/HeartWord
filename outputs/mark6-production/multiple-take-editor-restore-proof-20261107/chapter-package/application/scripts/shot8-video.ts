/**
 * Scene 1 Shot 8's stage 4/5 video generation, following the exact process
 * validated on Shot 7's pilot (see pilot-shot-video.ts) -- same 3-tier
 * fallback for master/cutaway beats, same Kling Avatar lip-sync + manual
 * Jesus-only crop for the two lip-sync inserts. Not a generalization of
 * the pilot script (that would risk regressing the working Shot 7 code);
 * a second concrete instance until a real per-shot driver is worth
 * building.
 *
 * Shot 8's beats (see docs/production/CODEX_HANDOFF.md's 2026-09-09
 * update for why this shot's beat IDs are new/replanned):
 *   1 master           0-3500ms     26091a7f-9ad5-4d3c-a233-7390a78247d4
 *   2 lip_sync_insert  3500-9654ms  b3a683e1-e71c-48d5-ac26-a5bedefe1148 (reuses shot's own keyframe)
 *   3 cutaway          9654-12654ms 53aea6da-0c67-4a8c-b4bc-43f5c127c4b7
 *   4 lip_sync_insert  12654-18808ms 0741dcd1-efdd-4142-802b-c930e02daa78
 *
 * Keyframe review findings (both new crops, tuned against real pixels,
 * checked via ffmpeg crop + visual read -- same method as Shot 7):
 * - Beat 2 reuses the shot's own single keyframe (Jesus + paralytic +
 *   packed crowd on both sides) -- same multi-face risk Shot 7 hit.
 *   Cropped tight on Jesus alone, narrowed twice after the first two
 *   attempts still left a sharp bystander face in frame.
 * - Beat 4's own keyframe is already a Jesus close-up but with sharp,
 *   in-focus crowd faces at both edges -- cropped tighter to isolate him.
 * - Beat 1 (master) audio has only a 304ms leading silence (confirmed via
 *   detect-silences.ts against this beat's own 0-3500ms slice) -- not a
 *   mid-speech pause, so unlike Shot 7's master this prompt can describe
 *   continuous speech with no special pause cadence.
 * - Beat 3 (cutaway) keyframe is a clean reaction shot on the paralytic's
 *   face (eyes open, looking up at Jesus, alert) with Jesus small/
 *   out-of-focus in the background -- safe as-is, no lip-sync risk.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingLipSyncProvider, KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";
import { cropKeyframe } from "../src/pipeline/media-generation/crop-keyframe.js";

const db = getDb();
const dataDir = getDataDir();
const shotId = "ea5e2ff9-c321-41f2-9c80-fd856c05d78d"; // Scene 1 Shot 8, Mark 2:10-11
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";

// Jesus-only crop boxes, tuned manually against each beat's actual
// keyframe pixels (see header comment). Kept close to 16:9 at the source
// -- see crop-keyframe.ts's checkAspectRatio -- so Kling's Avatar API,
// which preserves the INPUT aspect ratio in its output, doesn't hand
// assembly a shape that needs an aggressive fill-crop later.
const LIP_SYNC_CROPS: Record<number, { x: number; y: number; width: number; height: number }> = {
  2: { x: 680, y: 0, width: 620, height: 349 }, // shot's own keyframe (4f370426...)
  // Revised 2026-09-09 (round 2): the first crop (750x422 @ 350,60) left
  // almost no margin below Jesus's chin -- Dan caught his mouth drifting
  // to the very bottom edge of frame by ~3.3s into this beat, meaning
  // Kling's Avatar output isn't perfectly static even on a tight
  // lip-sync-only crop; some head/frame drift happens over the clip's
  // duration. Widened with real vertical headroom below the chin/neck;
  // the two background figures this reintroduces at the far corners are
  // confirmed soft-focus/blurred (checked by cropping into each corner
  // and viewing it directly), not the sharp, steady faces Kling's face
  // detection needs to lock onto.
  4: { x: 275, y: 20, width: 950, height: 534 } // beat 4's own keyframe (0741dcd1...)
};

const shot = db.prepare(`SELECT * FROM shots WHERE id = ?`).get(shotId) as any;
const beats = db.prepare(`SELECT * FROM coverage_beats WHERE shot_id = ? ORDER BY sequence`).all(shotId) as any[];
const shotKeyframe = db
  .prepare(
    `SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`
  )
  .get(shotId) as { result_asset_path: string };
const audioSeg = db
  .prepare(`SELECT source_path FROM audio_segments WHERE layer = 'composite_cast_master' AND verse_ref = 'Mark 2:10-11'`)
  .get() as { source_path: string };
const jesus = db
  .prepare(`SELECT c.id AS character_id, cv.id AS character_version_id FROM characters c
    JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
    WHERE c.name = 'Jesus'`)
  .get() as { character_id: string; character_version_id: string };

const videoProvider = new GeminiVideoProvider();
const klingSceneProvider = new KlingVideoProvider();
const draftProvider = new GeminiDraftVideoProvider();
const lipSyncProvider = new KlingLipSyncProvider();

const insertAttempt = db.prepare(
  `INSERT INTO generation_attempts
     (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertCostEntry = db.prepare(
  `INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)`
);
const insertClip = db.prepare(
  `INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)`
);
const findExistingClip = db.prepare(
  `SELECT id FROM clips WHERE shot_id = ? AND timeline_start_ms = ? AND timeline_end_ms = ?`
);

const PROMPTS: Record<number, string> = {
  1: "Static wide 16:9 master shot of a packed room in a Capernaum home. Jesus speaks with his mouth moving naturally, animated and engaged, from almost the very start of the shot and continuing without a pause through to the end, his hand extended toward the paralytic on the mat. Everyone else holds their pose with only subtle natural movement -- slight breathing, small shifts among the crowd, all listening attentively to Jesus. The paralytic lies still on his mat, eyes open, alert and hopeful, looking up at Jesus.",
  3: "Static 16:9 close reaction shot on the paralytic's face, looking up at Jesus with wide, alert, hopeful eyes. Jesus is small and out of focus in the background. No dialogue, mouth closed, no camera movement."
};

async function run() {
  console.log(`Shot 8: ${shot.verse_ref}, ${beats.length} beats, ${(beats[beats.length - 1].audio_end_ms / 1000).toFixed(1)}s total.\n`);

  for (const beat of beats) {
    const durationSec = Math.max(1, Math.round((beat.audio_end_ms - beat.audio_start_ms) / 1000));

    if (findExistingClip.get(shotId, beat.audio_start_ms, beat.audio_end_ms)) {
      console.log(`Beat ${beat.sequence} (${beat.beat_type}, ${durationSec}s) -- already has a clip, skipping.`);
      continue;
    }
    console.log(`Beat ${beat.sequence} (${beat.beat_type}, ${durationSec}s) -- starting...`);

    let result;
    let provider: string;
    let operation: string;

    if (beat.beat_type === "lip_sync_insert") {
      let keyframePath = beat.keyframe_asset_path ?? shotKeyframe.result_asset_path; // beat 2 reuses the shot's own keyframe

      const cropBox = LIP_SYNC_CROPS[beat.sequence];
      if (cropBox) {
        const sourceAbs = join(dataDir, "assets", keyframePath);
        const croppedRel = join("generated", "keyframes", "cropped", `${beat.id}.png`);
        const croppedAbs = join(dataDir, "assets", croppedRel);
        cropKeyframe(sourceAbs, cropBox, croppedAbs);
        keyframePath = croppedRel;
        console.log(`  cropped keyframe to isolate Jesus -- ${croppedRel}`);
      }

      result = await lipSyncProvider.sync(
        { characterId: jesus.character_id, characterVersionId: jesus.character_version_id },
        { path: audioSeg.source_path, startMs: beat.audio_start_ms, endMs: beat.audio_end_ms },
        { path: keyframePath }
      );
      provider = "kling";
      operation = "lip_sync";
    } else {
      const fallbackResult = await generateFinalVideoWithFallback(
        videoProvider,
        klingSceneProvider,
        draftProvider,
        { shotId: `${shotId}-beat${beat.sequence}`, prompt: PROMPTS[beat.sequence]!, characters: [] },
        { resolution: "720p", startFrame: { path: beat.keyframe_asset_path }, durationSeconds: durationSec }
      );
      result = fallbackResult;
      provider = fallbackResult.provenance.provider;
      operation = { veo: "generate_final", kling_scene: "generate_final", omni_draft: "generate_draft" }[fallbackResult.tier];
      console.log(`  (tier used: ${fallbackResult.tier}, Veo attempts: ${fallbackResult.veoAttempts})`);
    }

    console.log(`  -> ${result.status}, ${result.media?.path}, $${result.cost.usd}, model=${result.provenance.model}`);

    const attemptId = randomUUID();
    insertAttempt.run(
      attemptId,
      shotId,
      provider,
      result.provenance.model,
      operation,
      "720p",
      result.provenance.prompt,
      result.status,
      result.media?.path ?? null,
      result.cost.usd,
      Date.now()
    );
    insertCostEntry.run(randomUUID(), projectId, attemptId, result.cost.usd, Date.now());
    insertClip.run(randomUUID(), shotId, attemptId, beat.audio_start_ms, beat.audio_end_ms, Date.now());
  }

  console.log("\nDone. Clips for this shot:");
  const clips = db
    .prepare(
      `SELECT cl.timeline_start_ms, cl.timeline_end_ms, ga.provider, ga.operation, ga.result_asset_path, ga.cost_usd
       FROM clips cl JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id
       WHERE cl.shot_id = ? ORDER BY cl.timeline_start_ms`
    )
    .all(shotId);
  console.log(JSON.stringify(clips, null, 2));
}

run().catch((err) => {
  console.error("SHOT 8 GENERATION FAILED:", err);
  process.exit(1);
});
