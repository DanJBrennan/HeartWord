/**
 * Builds the full chapter render with every supplementary shot spliced in
 * at its narrative position: the two real Flow-source intro clips, the
 * Shot_004 canonical-Jesus recast, the 8 fresh HeartWord shots for the
 * four-friends/paralytic-healing sequence and the scribe/celebration
 * contrast beat, and the Creative Director / Production Director agents'
 * approved gap-fillers for the real narration coverage gaps (see
 * src/pipeline/creative-direction/ and scripts/report-narration-
 * coverage.ts). All of these are ADDITIONS -- none replace an existing
 * shot; they only expand the chapter's runtime (per Dan's standing
 * instruction).
 *
 * Placement reasoning (Scene 1 only; Scenes 2-4 unchanged):
 *   Shot 1 (crowd blocks doorway) -> Shot 2 (Jesus preaching inside) ->
 *   [NEW] friends-carrying-to-house (arrive, find it blocked) ->
 *   [NEW] friends-roof-arrival (climb stairs, set mat down) ->
 *   Shot 3 (wide: begin digging, EXTENDED 4s->8s) -> [NEW]
 *   friends-roof-digging (close action insert on same beat) -> [NEW]
 *   crowd-indoor-reaction-to-dust-falling (Mark 2:1-5 gap: crowd inside
 *   notices dust/debris falling before the opening breaks through) ->
 *   Shot 4 (lower bed through roof, EXTENDED 4s->8s) -> [NEW]
 *   pilot-shot004-recast (overhead angle, same beat, canon Jesus) ->
 *   [NEW] paralytic-s-tearful-hope-and-crowd-silence (Mark 2:1-5 gap:
 *   close reaction right before Jesus speaks) -> Shot 5 (Jesus forgives)
 *   -> [NEW] friends-watching-from-roof-aperture
 *   (Creative/Production Director approved, Mark 2:5-8 gap) -> [NEW]
 *   crowd-witness-breathless-reaction (same gap) -> Shot 6 (scribe
 *   questions in heart, EXTENDED 4s->8s by the Production Director's
 *   extend_existing authority) -> Shot 7 (Jesus challenges scribes) ->
 *   [NEW] paralytic-face-before-healing (emotional beat right before the
 *   healing command) -> Shot 8 (command to rise) -> [NEW] paralytic-
 *   astonishment (stunned reaction)
 *   -> Shot 9 (stands, rolls up bed, walks out) -> [NEW] 3-clip exit
 *   sequence (exits the doorway, rear-view walk with a joyful heel-click,
 *   continues down the lane as the doorway crowd applauds -- see
 *   docs/production/PARALYTIC_EXIT_SEQUENCE_HANDOFF.md) -> [NEW]
 *   paralytic-gratitude (looks up, deep breath) -> [NEW] friends-happy-
 *   glance (friends on the roof see it) -> Shot 10 (crowd amazed) ->
 *   [NEW] scribe-unhappy-amid-celebration (contrast beat) -> Scene 2
 *   onward.
 *
 * The 3-clip exit sequence is silent picture only -- its own generated
 * audio is muted (per the handoff doc) and, per Dan's direction, it does
 * NOT carry the real Hatam narration underneath it either: that stretch
 * is expected to carry a music bed later, not narration, so leaving it
 * silent for now is correct rather than a gap to close.
 *
 * Reuses the same normalization approach as assembleChapter
 * (src/pipeline/assembly/assemble-chapter.ts): every segment is
 * re-encoded to 1280x720/24fps with a guaranteed (possibly silent) audio
 * track before the concat demuxer joins them.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 24;
const AUDIO_SAMPLE_RATE = 44100;
const PROJECT_ID = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";

const db = getDb();
const dataDir = getDataDir();

interface ShotClipRow {
  shot_id: string;
  result_asset_path: string;
  timeline_start_ms: number;
  timeline_end_ms: number;
}

function ffprobeDurationMs(absPath: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", absPath], {
    encoding: "utf-8"
  });
  return Math.round(parseFloat(out.trim()) * 1000);
}

function hasAudioStream(absPath: string): boolean {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", absPath], {
    encoding: "utf-8"
  });
  return out.trim().length > 0;
}

/** Mutes the source's own (provider-generated) audio and lays in a slice of
 *  the real Hatam master audio instead -- used to keep the approved
 *  narration/dialogue continuous under silent-picture inserts (see
 *  docs/production/PARALYTIC_EXIT_SEQUENCE_HANDOFF.md). */
function normalizeWithAudioOverride(
  sourceAbsPath: string,
  durationMs: number,
  audioAbsPath: string,
  audioStartMs: number,
  outPath: string
): void {
  const durationSec = (durationMs / 1000).toFixed(3);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      sourceAbsPath,
      "-ss",
      (audioStartMs / 1000).toFixed(3),
      "-t",
      durationSec,
      "-i",
      audioAbsPath,
      "-t",
      durationSec,
      "-vf",
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=${TARGET_FPS}`,
      "-ar",
      String(AUDIO_SAMPLE_RATE),
      "-ac",
      "2",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-shortest",
      outPath
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
}

function normalizeForConcat(sourceAbsPath: string, durationMs: number, outPath: string): void {
  const durationSec = (durationMs / 1000).toFixed(3);
  if (hasAudioStream(sourceAbsPath)) {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        sourceAbsPath,
        "-t",
        durationSec,
        "-vf",
        `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=${TARGET_FPS}`,
        "-ar",
        String(AUDIO_SAMPLE_RATE),
        "-ac",
        "2",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-c:a",
        "aac",
        outPath
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
  } else {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        sourceAbsPath,
        "-f",
        "lavfi",
        "-i",
        `anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=stereo`,
        "-t",
        durationSec,
        "-vf",
        `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=${TARGET_FPS}`,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-shortest",
        outPath
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
  }
}

/** Forces the source's own audio (real or provider-generated) out entirely
 *  and lays in explicit digital silence instead. Every ad-hoc AI-generated
 *  insert in this timeline came from generateFinalVideoWithFallback/
 *  recastCharacter directly, outside the real per-shot pipeline that
 *  deliberately drops provider audio (assemble-single-shot.ts's own rule:
 *  "provider video audio is always dropped, only real dialogue plays") --
 *  several of them (confirmed via ffprobe) carry a provider-generated
 *  audio track that was never intentionally muted before reaching this
 *  script, and would otherwise play through unmuted into the final cut. */
function normalizeForceMuted(sourceAbsPath: string, durationMs: number, outPath: string): void {
  const durationSec = (durationMs / 1000).toFixed(3);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      sourceAbsPath,
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=stereo`,
      "-t",
      durationSec,
      "-vf",
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=${TARGET_FPS}`,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-shortest",
      outPath
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
}

function concatClips(clipPaths: string[], outPath: string, tmpDir: string): void {
  const listPath = join(tmpDir, "concat-list.txt");
  const listContent = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  writeFileSync(listPath, listContent);
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath], {
    stdio: ["ignore", "ignore", "pipe"]
  });
}

const shotClips = db
  .prepare(
    `SELECT s.id AS shot_id, ga.result_asset_path, cl.timeline_start_ms, cl.timeline_end_ms
     FROM shots s
     JOIN scenes sc ON sc.id = s.scene_id
     JOIN clips cl ON cl.shot_id = s.id
     JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id
     WHERE sc.project_id = ? AND ga.operation = 'assemble_shot' AND ga.status = 'accepted'
       AND ga.created_at = (
         SELECT MAX(ga2.created_at)
         FROM clips cl2
         JOIN generation_attempts ga2 ON ga2.id = cl2.generation_attempt_id
         WHERE cl2.shot_id = s.id AND ga2.operation = 'assemble_shot' AND ga2.status = 'accepted'
       )`
  )
  .all(PROJECT_ID) as unknown as ShotClipRow[];

const byShotId = new Map(shotClips.map((c) => [c.shot_id, c]));

type AudioOverride = { relPath: string; startMs: number };
type Segment =
  | { kind: "shot"; shotId: string; audioOverride?: AudioOverride; durationMsOverride?: number }
  | { kind: "raw"; relPath: string; label: string; durationMsOverride?: number; audioOverride?: AudioOverride; forceMute?: boolean };

const SHOT = (id: string, audioOverride?: AudioOverride, durationMsOverride?: number): Segment => ({
  kind: "shot",
  shotId: id,
  audioOverride,
  durationMsOverride
});
const RAW = (
  relPath: string,
  label: string,
  opts?: { durationMsOverride?: number; audioOverride?: AudioOverride; forceMute?: boolean }
): Segment => ({
  kind: "raw",
  relPath,
  label,
  ...opts
});
// Every ad-hoc HeartWord-provider-generated insert this session, muted by
// default (see normalizeForceMuted's header comment) -- pass forceMute:
// false explicitly if a specific clip is later confirmed to need its own
// real audio kept.
const AI_GENERATED_INSERT = { forceMute: true };

const timeline: Segment[] = [
  // Chapter title card (docs/design/chapter-title-card.md, decided with
  // Dan 2026-09-10: opening card only, no persistent on-screen mark).
  // Real font rendering (scripts/build-chapter-title-card.ts), never
  // AI-generated -- every provider prompt in this pipeline forbids
  // in-scene text.
  RAW("generated/chapter/blocks/mark-2-title-card.mp4", "title-card"),
  RAW("generated/pilot-source/shot-000-ancient-fishing.mp4", "pilot-intro-1"),
  RAW("generated/pilot-source/shot-000b-people-in.mp4", "pilot-intro-2"),
  // Pre-built block (scripts/build-mark-2-1-5-narration-block.ts): the new
  // Jesus-enters-empty-house insert (trimmed to the real chapter-title
  // speech length), the reused crowd-gathering shot (trimmed to the real
  // recorded pause), the over-the-shoulder Shot 2 reshoot, and the rest
  // of the digging/lowering beat -- with the real "Mark 2:1-5 (narration)"
  // audio (68955ms) muxed continuously underneath. Dan caught (2026-09-10)
  // that this whole span was previously ~23s of total silence in this
  // pipeline -- the earlier gap-closing work only ever fixed this in the
  // separate Blender-editor extraction, never here. 8436ms freeze-frame
  // padding on the last clip (paralytic's tearful hope) makes the video
  // match the real narration exactly, so Shot 5's own dialogue never
  // overlaps the narration bed.
  RAW("generated/chapter/blocks/mark-2-1-5-narration-block.mp4", "mark-2-1-5-narration-block"),
  SHOT("445d00de-7f66-494d-a104-d3e927d5dbdd"), // Scene1 Shot5
  // Pre-built block (scripts/build-narration-audio-block.ts):
  // crowd-witness-breathless-reaction + Shot6 (scribes, extended), with
  // the real "Mark 2:5-8 (narration)" audio muxed continuously underneath
  // -- Dan caught this span playing silent in review (2026-09-10); closing
  // the gap's VISUAL duration earlier this session never actually closed
  // the AUDIO gap. friends-watching-from-roof-aperture, originally part of
  // this group, was repositioned (2026-09-10, Dan) to the digging beat
  // inside the Mark 2:1-5 block above -- "the moment the hole finally
  // opens" -- so this group is now just the 2 remaining clips, with 7083ms
  // of freeze-frame padding (up from 3083ms) on Shot6's already-still
  // final frame so the real narration audio never gets cut short.
  RAW("generated/chapter/blocks/mark-2-5-8-narration-block.mp4", "mark-2-5-8-narration-block"),
  SHOT("0d43887a-8c20-4271-a6d8-3cafad177558"), // Scene1 Shot7
  RAW("generated/video/paralytic-face-before-healing.mp4", "paralytic-face-before-healing", AI_GENERATED_INSERT),
  SHOT("ea5e2ff9-c321-41f2-9c80-fd856c05d78d"), // Scene1 Shot8
  // New (2026-09-10, Dan's review note: "instant stand, need a transition
  // where he gets up"): bridges the cut from lying on the mat (end of
  // Shot 8) directly to already-standing (the astonishment insert) --
  // there was never a shot of the actual physical rising motion.
  RAW("generated/video/paralytic-rises-from-mat.mp4", "paralytic-rises-from-mat", AI_GENERATED_INSERT),
  // Reshoot (2026-09-10, Dan's review note: "roof is now angled pitch"):
  // the original take (kling-926869751820460115.mp4) rendered a peaked
  // gable roof with a skylight, contradicting the flat roof established
  // by the digging shots -- replaced with a corrected flat-roof take.
  RAW("generated/video/kling-927152808813142035.mp4", "paralytic-astonishment-flatroof", AI_GENERATED_INSERT),
  SHOT("e84e957d-de28-4d44-9bf9-9e84cd83a2ec"), // Scene1 Shot9
  RAW("generated/video/kling-926868332358275129.mp4", "paralytic-exits-house", AI_GENERATED_INSERT),
  RAW("generated/video/mark-2-paralytic-rear-heel-click-veo.mp4", "paralytic-heel-click-celebration", AI_GENERATED_INSERT),
  RAW("generated/video/mark-2-paralytic-walks-away-applause-veo.mp4", "paralytic-walks-away-applause", AI_GENERATED_INSERT),
  RAW("generated/video/kling-926838984880947236.mp4", "paralytic-gratitude", AI_GENERATED_INSERT),
  RAW("generated/video/friends-happy-glance.mp4", "friends-happy-glance", AI_GENERATED_INSERT),
  SHOT("27416798-3186-468a-978d-35b74297ea2f"), // Scene1 Shot10
  RAW("generated/video/scribe-unhappy-amid-celebration.mp4", "scribe-unhappy-amid-celebration", AI_GENERATED_INSERT),
  SHOT("81f67f72-22b0-4ca7-84cd-addd7b42115b"), // Scene2 Shot1
  SHOT("26d03459-0d6a-4f1d-b9e3-5239014539bf"), // Scene2 Shot2
  SHOT("ce87d971-d15f-4a75-b636-1c9dcb52a1fb"), // Scene2 Shot3
  RAW("generated/video/matthew-hesitates-at-his-coins-before-choosing-to-follow.mp4", "matthew-hesitates-at-his-coins-before-choosing-to-follow", AI_GENERATED_INSERT), // Mark 2:12-14 gap
  SHOT("097de51b-95bd-485d-952f-10e84160e13a"), // Scene2 Shot4 (extended 4s->8s)
  SHOT("19997eba-627e-46e4-ac5b-946265fe57dc"), // Scene2 Shot5 (extended 4s->5.1s, Kling fallback)
  RAW("generated/video/kling-926905441325154362.mp4", "matthew-serving-bread-and-drink-to-jesus-and-guests"), // Mark 2:14-16 gap (Kling fallback, no audio track)
  RAW("generated/video/disciples-observe-scribes-murmuring-at-doorway.mp4", "disciples-observe-scribes-murmuring-at-doorway", AI_GENERATED_INSERT), // Mark 2:14-16 gap
  SHOT("9101333a-d2ef-4067-ae4d-c47fc0d398d2"), // Scene2 Shot6
  SHOT("462acce5-2fd3-41df-a38f-872e29a891f3"), // Scene2 Shot7
  SHOT("cb1856ec-2e9f-4ba7-804c-a758da8c20d5"), // Scene2 Shot8
  RAW("generated/video/matthew-and-disciples-reacting-at-table.mp4", "matthew-and-disciples-reacting-at-table", AI_GENERATED_INSERT), // Mark 2:17-18 gap
  SHOT("8afd8f47-6a49-43ee-8b97-74598a000331"), // Scene3 Shot1
  RAW("generated/video/scribes-observing-near-doorway.mp4", "scribes-observing-near-doorway", AI_GENERATED_INSERT), // Mark 2:17-18 gap
  SHOT("f26b7be7-3801-4b47-8d38-a8ada38aa981"), // Scene3 Shot2
  SHOT("9a1b2acb-6da9-4291-a4e1-5cbd78629e2c"), // Scene3 Shot3
  RAW("generated/video/disciples-react-warmly-to-jesus-wedding-analogy.mp4", "disciples-react-warmly-to-jesus-wedding-analogy", AI_GENERATED_INSERT), // Mark 2:18-19 gap
  RAW("generated/video/questioners-processing-jesus-counter-question.mp4", "questioners-processing-jesus-counter-question", AI_GENERATED_INSERT), // Mark 2:18-19 gap
  SHOT("9c291cdd-389e-45db-b737-866543d730c6"), // Scene3 Shot4
  SHOT("44009342-73b8-4b8a-ad46-085d64253258"), // Scene3 Shot5
  SHOT("8209a47b-eaa0-4dcd-9a43-e3a9afd2e369"), // Scene3 Shot6
  SHOT("7b719b16-ee4d-4d6a-90ff-3c22327f1a86"), // Scene4 Shot1 (extended 4s->8s)
  RAW("generated/video/close-up-of-peter-rubbing-grain-and-chaff.mp4", "close-up-of-peter-rubbing-grain-and-chaff", AI_GENERATED_INSERT), // Mark 2:22-24 gap
  RAW("generated/video/scribes-watch-in-silent-disapproval.mp4", "scribes-watch-in-silent-disapproval", AI_GENERATED_INSERT), // Mark 2:22-24 gap
  SHOT("94a721a3-1fc6-44d1-a9e2-9021e26ec408"), // Scene4 Shot2
  SHOT("cef5e711-3d67-4b5c-aff1-4315587c6e23"), // Scene4 Shot3
  SHOT("96199814-0884-4a4a-bd95-b84950fce4fd"), // Scene4 Shot4
  RAW("generated/video/kling-926911320539140170.mp4", "peter-s-reverent-reflection", AI_GENERATED_INSERT) // Mark 2:28 gap
];

function run() {
  if (shotClips.length !== 28) {
    throw new Error(`Expected 28 existing assembled shots, found ${shotClips.length}.`);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "heartword-full-chapter-"));
  try {
    const normalizedPaths: string[] = [];
    let totalDurationMs = 0;
    let idx = 0;
    for (const seg of timeline) {
      idx++;
      let sourceAbsPath: string;
      let durationMs: number;
      let label: string;
      let audioOverride: AudioOverride | undefined;
      if (seg.kind === "shot") {
        const clip = byShotId.get(seg.shotId);
        if (!clip) throw new Error(`No assembled clip found for shot ${seg.shotId}`);
        sourceAbsPath = join(dataDir, "assets", clip.result_asset_path);
        // Use the REAL file duration, not the DB's timeline_end_ms -
        // timeline_start_ms -- Shot 5 and Shot 10's accepted clips are
        // genuinely only ~5.04s (a shorter regenerated take never
        // reconciled back into the clips table). Trusting the stale DB
        // value made `-t` request a longer trim than the source has,
        // silently producing a shorter-than-intended segment and
        // shifting everything after it (found 2026-09-10, Dan caught it
        // by ear as "Jesus mouthing words in silence" / a frozen tail).
        {
          const dbDurationMs = clip.timeline_end_ms - clip.timeline_start_ms;
          const realDurationMs = ffprobeDurationMs(sourceAbsPath);
          if (Math.abs(dbDurationMs - realDurationMs) > 100) {
            console.log(`  NOTE: shot ${seg.shotId} DB duration ${dbDurationMs}ms != real file duration ${realDurationMs}ms -- using real duration.`);
          }
          durationMs = seg.durationMsOverride ?? realDurationMs;
        }
        label = seg.shotId;
        audioOverride = seg.audioOverride;
      } else {
        sourceAbsPath = join(dataDir, "assets", seg.relPath);
        if (!existsSync(sourceAbsPath)) throw new Error(`Missing raw clip at ${sourceAbsPath}`);
        durationMs = seg.durationMsOverride ?? ffprobeDurationMs(sourceAbsPath);
        label = seg.label;
        audioOverride = seg.audioOverride;
      }
      const forceMute = seg.kind === "raw" && seg.forceMute === true;
      console.log(
        `[${idx}/${timeline.length}] ${label} (${durationMs}ms)${audioOverride ? " [master audio]" : ""}${forceMute ? " [muted]" : ""}`
      );
      const normalizedPath = join(tmpDir, `${idx.toString().padStart(3, "0")}-${label.replace(/[^a-zA-Z0-9-]/g, "_")}.mp4`);
      if (audioOverride) {
        const audioAbsPath = join(dataDir, "assets", audioOverride.relPath);
        normalizeWithAudioOverride(sourceAbsPath, durationMs, audioAbsPath, audioOverride.startMs, normalizedPath);
      } else if (forceMute) {
        normalizeForceMuted(sourceAbsPath, durationMs, normalizedPath);
      } else {
        normalizeForConcat(sourceAbsPath, durationMs, normalizedPath);
      }
      normalizedPaths.push(normalizedPath);
      totalDurationMs += durationMs;
    }

    const relPath = join("generated", "chapter", `${PROJECT_ID}-full-with-inserts.mp4`);
    const outPath = join(dataDir, "assets", relPath);
    mkdirSync(join(dataDir, "assets", "generated", "chapter"), { recursive: true });
    concatClips(normalizedPaths, outPath, tmpDir);

    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO chapter_renders (id, project_id, result_asset_path, total_duration_ms, shot_count, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, PROJECT_ID, relPath, totalDurationMs, timeline.length, now);

    console.log(`\nDone: ${relPath}`);
    console.log(`Total duration: ${(totalDurationMs / 1000).toFixed(1)}s, ${timeline.length} segments`);
    console.log(`Full path: ${outPath}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

run();
