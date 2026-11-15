/**
 * One-shot pilot for stage 4/5 video generation: turns Scene 1 Shot 7's
 * four accepted coverage-beat keyframes into real clips and records them
 * as generation_attempts + clips rows, timeline-positioned by each beat's
 * own audio_start_ms/audio_end_ms (shot-local for this pilot -- placing
 * clips on the full PROJECT timeline is a separate later step).
 *
 * Revised 2026-09-09 per Dan's review of the first pass:
 * 1. Both Jesus and the scribe were mouthing Jesus's audio in the Kling
 *    Avatar lip-sync clips -- the keyframes used for beats 2 and 4 had
 *    both faces clearly visible, and Kling evidently syncs every
 *    detected face, not just the intended speaker. Fixed by cropping
 *    each lip-sync beat's keyframe tight enough that only Jesus's face is
 *    visible before handing it to Kling (see crop-keyframe.ts -- this is
 *    a manual per-image pixel box, not automatic face detection).
 * 2. "Let's avoid the 360p quality whenever we can" -- generateFinal now
 *    routes through generateFinalVideoWithFallback's 3-tier chain (Veo
 *    retries -> Kling's plain scene image2video -> Omni 360p draft only
 *    as a last resort), not straight to Omni after Veo's RAI filter.
 * 3. Ambient audio: no code change needed -- veo-3.1-lite-generate-preview
 *    already generates audio by default and rejects an explicit
 *    generateAudio param either way (confirmed empirically), so nothing
 *    was suppressing it in the first place.
 *
 * Real, paid provider calls. Beats 1, 2, and 4 were cleared and are
 * redone here; beat 3's prior successful Veo result is left alone
 * (findExistingClip skips it).
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
const shotId = "0d43887a-8c20-4271-a6d8-3cafad177558"; // Scene 1 Shot 7, Mark 2:8-9
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";

// See this file's header comment #1 -- Jesus-only crop boxes, tuned
// manually against each beat's actual keyframe pixels.
// Revised to a 16:9-shaped box (not just any tight crop) after the first
// attempt (480x700, 850x750 -- both far from 16:9) came back from Kling
// in that SAME odd aspect ratio, which then needed an aggressive
// fill-crop in assembly that cut Jesus's face out of frame entirely.
// Keeping the crop itself close to 16:9 avoids that problem at the
// source instead of fighting it downstream.
const LIP_SYNC_CROPS: Record<number, { x: number; y: number; width: number; height: number }> = {
  2: { x: 60, y: 0, width: 780, height: 439 }, // shot's own keyframe (09859fa8...)
  4: { x: 230, y: 120, width: 800, height: 450 } // beat 4's own keyframe (9ec6bde6...)
};

const shot = db.prepare(`SELECT * FROM shots WHERE id = ?`).get(shotId) as any;
const beats = db.prepare(`SELECT * FROM coverage_beats WHERE shot_id = ? ORDER BY sequence`).all(shotId) as any[];
const shotKeyframe = db
  .prepare(
    `SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`
  )
  .get(shotId) as { result_asset_path: string };
const audioSeg = db
  .prepare(`SELECT source_path FROM audio_segments WHERE layer = 'composite_cast_master' AND verse_ref = 'Mark 2:8-10'`)
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
  // Revised 2026-09-09 (round 2): "continuously" talking overshot the
  // other way -- Dan caught Jesus's mouth animated through a real ~0.8s
  // pause actually present in the audio (confirmed via detect-silences.ts
  // against this beat's own audio slice: a silence gap at 2.47s-3.26s
  // within this 3.5s beat). Describing the real speak-then-pause cadence
  // directly in the prompt (not just "talks naturally") let the mouth
  // rest during that window -- confirmed by sampling frames: open/parted
  // at 1.0s, closed at 1.5s/2.9s/3.3s. Not frame-accurate sync (no
  // audio-driven lip movement is happening, just a described cadence),
  // but tracks the real pause far better than "continuous" did. Beats
  // longer or with pauses elsewhere need their own detect-silences check
  // and their own cadence description -- this exact wording only fits
  // this beat's specific 2.47-3.26s gap.
  1: "Static wide 16:9 master shot of a packed room in a Capernaum home. Jesus speaks with his mouth moving naturally, animated and engaged, for the first two to three seconds, with his hand gesturing for emphasis -- then he pauses, his mouth closing and going still, holding a brief silent beat before the shot ends, as if catching his breath mid-speech. Everyone else holds their pose with only subtle natural movement -- slight breathing, small shifts among the crowd, all listening attentively to Jesus. The paralytic lies still on his mat, eyes open, alert and hopeful.",
  3: "Static 16:9 close reaction shot. The scribe shifts uneasily, eyes flicking toward Jesus, mouth closed, a flicker of discomfort crossing his face. No dialogue, no camera movement."
};

// Beat 1's master keyframe originally showed the paralytic lying flat and
// motionless -- an ImageEditor.editRegion pass (head propped, eyes open)
// made Veo's filter passable at all; kept as the canonical keyframe.
const EDITED_MASTER_KEYFRAME =
  "generated/edits/a70da82f-890f-46fc-87ad-73ae6aa3a303-0db9357b-9407-438e-b560-29315b2365ea-0ad985c8.jpg";
db.prepare(`UPDATE coverage_beats SET keyframe_asset_path = ? WHERE id = 'a70da82f-890f-46fc-87ad-73ae6aa3a303'`).run(
  EDITED_MASTER_KEYFRAME
);

async function run() {
  console.log(`Pilot: ${shot.verse_ref}, ${beats.length} beats, ${(beats[beats.length - 1].audio_end_ms / 1000).toFixed(1)}s total.\n`);

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
        console.log(`  cropped keyframe to isolate Jesus (excluding the scribe) -- ${croppedRel}`);
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
  console.error("PILOT FAILED:", err);
  process.exit(1);
});
