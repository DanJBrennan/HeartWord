/**
 * Builds the "Mark 2:1-5 (narration)" continuous audio block -- confirmed
 * (2026-09-10) that this whole span (crowd gathers / Jesus preaches /
 * friends dig and lower the paralytic through the roof) was TOTALLY
 * SILENT in the canonical full-chapter render (~23s of dead air,
 * verified via ffmpeg silencedetect on the existing
 * fe1408a5-...-full-with-inserts.mp4), violating the hard "narrator must
 * never go silent" requirement in docs/design/timeline.md -- this gap
 * was never actually closed in this pipeline, only in the separate
 * Blender-editor extraction (scripts/extract-healing-sequence.ts).
 *
 * Segment list/trims mirror extract-healing-sequence.ts exactly (Dan's
 * 2026-09-10 direction: new Jesus-enters-house insert trimmed to the real
 * chapter-title speech length, reused crowd shot trimmed to the real
 * recorded pause, over-the-shoulder Shot 2 reshoot) so the two pipelines
 * tell the same story -- see that script for the narrative reasoning.
 */
import "dotenv/config";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { buildNarrationAudioBlock, type AudioBlockSegment } from "./build-narration-audio-block.js";

const PROJECT_ID = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";

async function run() {
  const db = getDb();
  const dataDir = getDataDir();

  function latestShotClip(shotId: string): { result_asset_path: string; dur: number } {
    return db
      .prepare(
        `SELECT ga.result_asset_path, cl.timeline_end_ms - cl.timeline_start_ms AS dur FROM clips cl
         JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id
         WHERE cl.shot_id = ? AND ga.operation = 'assemble_shot' AND ga.status = 'accepted'
         ORDER BY ga.created_at DESC LIMIT 1`
      )
      .get(shotId) as { result_asset_path: string; dur: number };
  }

  const shot1 = latestShotClip("f6386c84-b0b0-404d-b080-faa644443f72");
  const shot3 = latestShotClip("b18da4bb-4f23-42c9-bbd1-b02f04cceb67");
  const shot4 = latestShotClip("b6edbb4d-4643-40c0-8f16-ed5eb9730df1");

  const segments: AudioBlockSegment[] = [
    { sourceAbsPath: join(dataDir, "assets", "generated/video/kling-927123598505017405.mp4"), durationMs: 2926, label: "jesus-and-disciples-enter-house" },
    // New (2026-09-10, Dan): a gradually growing crowd plays first --
    // Shot 1 (fully packed, doorway blocked) now makes sense as the
    // payoff after this build-up, so it plays at its full native length
    // instead of being trimmed to the bare recorded-pause duration.
    { sourceAbsPath: join(dataDir, "assets", "generated/video/crowd-gathers-at-doorway.mp4"), durationMs: 4000, label: "crowd-gathers-at-doorway" },
    { sourceAbsPath: join(dataDir, "assets", shot1.result_asset_path), durationMs: shot1.dur, label: "shot1-crowd-blocks-doorway" },
    { sourceAbsPath: join(dataDir, "assets", "generated/video/shot2-jesus-preaches-over-shoulder.mp4"), durationMs: 4000, label: "shot2-over-shoulder" },
    { sourceAbsPath: join(dataDir, "assets", "generated/video/friends-carrying-to-house.mp4"), durationMs: 4000, label: "friends-carrying-to-house" },
    // New (2026-09-10, Dan): "We need a clip where the four friends are
    // approaching the stairs" -- bridges street level and the rooftop.
    { sourceAbsPath: join(dataDir, "assets", "generated/video/friends-approach-stairs.mp4"), durationMs: 4000, label: "friends-approach-stairs" },
    { sourceAbsPath: join(dataDir, "assets", "generated/video/friends-roof-arrival.mp4"), durationMs: 4000, label: "friends-roof-arrival" },
    // Reordered (2026-09-10, Dan): the close-up digging insert now plays
    // BEFORE the wide establishing digging shot (tight-then-pull-back).
    { sourceAbsPath: join(dataDir, "assets", "generated/video/friends-roof-digging.mp4"), durationMs: 4000, label: "friends-roof-digging" },
    { sourceAbsPath: join(dataDir, "assets", shot3.result_asset_path), durationMs: shot3.dur, label: "shot3-digging-extended" },
    { sourceAbsPath: join(dataDir, "assets", "generated/video/crowd-indoor-reaction-to-dust-falling.mp4"), durationMs: 8000, label: "crowd-indoor-reaction-to-dust-falling" },
    { sourceAbsPath: join(dataDir, "assets", "generated/video/friends-watching-from-roof-aperture.mp4"), durationMs: 4000, label: "friends-watching-from-roof-aperture" },
    // New (2026-09-10, Dan): "the lowering...clip is too soon" -- more
    // roof-opening material (readying the ropes) plays before Shot 4.
    { sourceAbsPath: join(dataDir, "assets", "generated/video/friends-ready-ropes-at-opening.mp4"), durationMs: 4000, label: "friends-ready-ropes-at-opening" },
    { sourceAbsPath: join(dataDir, "assets", shot4.result_asset_path), durationMs: shot4.dur, label: "shot4-lowering-extended" },
    { sourceAbsPath: join(dataDir, "assets", "generated/video/pilot-shot004-recast.mp4"), durationMs: 4000, label: "pilot-shot004-recast" },
    // No longer freeze-padded: enough real coverage now exists that the
    // group runs slightly LONGER than the real narration on its own --
    // buildNarrationAudioBlock pads the audio with trailing silence
    // instead of truncating this clip's tail (see its 2026-09-10 fix).
    { sourceAbsPath: join(dataDir, "assets", "generated/video/paralytic-s-tearful-hope-and-crowd-silence.mp4"), durationMs: 8000, label: "paralytic-s-tearful-hope-and-crowd-silence" }
  ];

  const narrationRow = db
    .prepare(`SELECT source_path, start_ms, end_ms FROM audio_segments WHERE verse_ref = 'Mark 2:1-5 (narration)' AND source_path LIKE '%vocals%'`)
    .get() as { source_path: string; start_ms: number; end_ms: number };

  const outRelPath = "generated/chapter/blocks/mark-2-1-5-narration-block.mp4";
  const outAbsPath = join(dataDir, "assets", outRelPath);

  const result = buildNarrationAudioBlock(
    segments,
    { sourceAbsPath: join(dataDir, "assets", narrationRow.source_path), startMs: narrationRow.start_ms, endMs: narrationRow.end_ms },
    outAbsPath
  );

  console.log(JSON.stringify({ outRelPath, ...result }, null, 2));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
