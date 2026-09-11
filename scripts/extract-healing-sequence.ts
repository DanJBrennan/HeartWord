/**
 * Extracts the exact ordered clip list + real timing for the "healing
 * sequence" calibration pass (Dan's Blender editing pass, 2026-09-10):
 * from the paralytic's forgiveness declaration through the scribe's
 * disapproval amid the crowd's celebration.
 *
 * Unlike assemble-full-chapter-with-inserts.ts's ffmpeg pipeline (which
 * had to physically merge a group of shots into one file to mux
 * continuous narration audio under a hard cut), this outputs each shot
 * as its own separate, independently-editable video segment -- a real
 * NLE doesn't need that merge at all: a continuous audio strip can span
 * multiple separate video strips on its own track. Confirmed live
 * (2026-09-10): the merged-block approach made the roof-peeking shot
 * impossible to select/replace on its own in Blender's timeline, which
 * defeats the whole point of building a real per-clip editor.
 *
 * Outputs two things:
 *   - `videoSegments`: every shot/insert as its own strip, in story
 *     order, with `muteOwnAudio` marking which ones carry a provider-
 *     generated audio track that must never be heard (per this
 *     project's standing rule: only real dialogue/narration ever plays).
 *   - `audioBeds`: real continuous audio (narration or otherwise) that
 *     spans a specific timeline range independently of video-strip
 *     boundaries -- e.g. the real "Mark 2:5-8 (narration)" line, which
 *     plays underneath 3 separate video cuts without cutting the
 *     narrator off mid-word.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const PROJECT_ID = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";

function ffprobeDurationMs(absPath: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", absPath], {
    encoding: "utf-8"
  });
  return Math.round(parseFloat(out.trim()) * 1000);
}

function hasAudio(absPath: string): boolean {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", absPath], {
    encoding: "utf-8"
  }).trim();
  return out.length > 0;
}

const dataDir = getDataDir();
const db = getDb();

interface ShotClipRow {
  shot_id: string;
  result_asset_path: string;
  timeline_start_ms: number;
  timeline_end_ms: number;
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
         SELECT MAX(ga2.created_at) FROM clips cl2 JOIN generation_attempts ga2 ON ga2.id = cl2.generation_attempt_id
         WHERE cl2.shot_id = s.id AND ga2.operation = 'assemble_shot' AND ga2.status = 'accepted'
       )`
  )
  .all(PROJECT_ID) as unknown as ShotClipRow[];
const byShotId = new Map(shotClips.map((c) => [c.shot_id, c]));

type Seg =
  | { kind: "shot"; shotId: string; label: string; muteOwnAudio?: boolean; durationMsOverride?: number }
  | { kind: "raw"; relPath: string; label: string; muteOwnAudio?: boolean; durationMsOverride?: number };
const SHOT = (shotId: string, label: string, durationMsOverride?: number): Seg => ({ kind: "shot", shotId, label, durationMsOverride });
const RAW = (relPath: string, label: string, muteOwnAudio = true, durationMsOverride?: number): Seg => ({
  kind: "raw",
  relPath,
  label,
  muteOwnAudio,
  durationMsOverride
});

const sequence: Seg[] = [
  // Chapter title card (docs/design/chapter-title-card.md, decided with
  // Dan 2026-09-10: opening card only, no persistent on-screen mark).
  // Real font rendering (build-chapter-title-card.ts), never AI-generated.
  RAW("generated/chapter/blocks/mark-2-title-card.mp4", "title-card (Markus 2 / Hatam)", false),
  RAW("generated/pilot-source/shot-000-ancient-fishing.mp4", "pilot-intro-1 (birds-eye Capernaum)", false),
  RAW("generated/pilot-source/shot-000b-people-in.mp4", "pilot-intro-2 (street scene)", false),
  // New (2026-09-10): Jesus + 3 disciples walk the street and enter the
  // empty house, before any crowd -- plays under the real Hatam
  // narration's chapter-title announcement ("Markus 2..."), which is
  // followed by a genuine ~1.6s recorded pause before verse narration
  // resumes. See the "Mark 2:1-5 (narration)" audio bed below.
  // Trimmed to 2926ms: real detected speech duration of "Markus 2 / Yesus
  // bindei ba..." (the chapter title + pericope heading) at the start of
  // vocals.mp3, via ffmpeg silencedetect -- the cut to the next clip
  // lands exactly where the real recorded pause begins.
  RAW("generated/video/kling-927123598505017405.mp4", "jesus-and-disciples-enter-house", false, 2926),
  // New (2026-09-10, Dan): a gradually growing crowd plays first, during
  // the real recorded pause -- Shot 1 (fully packed, doorway blocked)
  // now makes sense as the payoff after this build-up, so it plays at
  // its full native length instead of being trimmed to the bare pause
  // duration ("The clip of the crowd outside the house is now too
  // short... it should be a few seconds longer").
  RAW("generated/video/crowd-gathers-at-doorway.mp4", "crowd-gathers-at-doorway"),
  SHOT("f6386c84-b0b0-404d-b080-faa644443f72", "Mark 2:1-2 -- crowd blocks the doorway"),
  // Reshoot (2026-09-10): the original Shot 2 take showed Jesus's face/
  // lips directly, which doesn't work now that this beat plays under
  // real narration (not lip-synced dialogue) rather than his own
  // dialogue -- replaced with an over-the-shoulder take that never shows
  // his mouth. Ad-hoc insert; the DB-tracked shots.8d9ac62b record and
  // the ffmpeg chapter-assembly pipeline are untouched.
  // muteOwnAudio=true (Dan caught, 2026-09-10): Veo generated real
  // (English) speech audio for this clip despite Jesus's mouth being
  // off-camera -- must stay muted since the real Hatam narration bed
  // already covers this beat; leaving it unmuted doubled the audio.
  RAW("generated/video/shot2-jesus-preaches-over-shoulder.mp4", "Mark 2:2 -- Jesus preaches to the crowd (over-the-shoulder)"),
  RAW("generated/video/friends-carrying-to-house.mp4", "friends-carrying-to-house"),
  // New (2026-09-10, Dan): "We need a clip where the four friends are
  // approaching the stairs" -- bridges street level and the rooftop.
  RAW("generated/video/friends-approach-stairs.mp4", "friends-approach-stairs"),
  RAW("generated/video/friends-roof-arrival.mp4", "friends-roof-arrival"),
  // Reordered (2026-09-10, Dan): the close-up digging insert now plays
  // BEFORE the wide establishing digging shot (tight-then-pull-back),
  // not after it.
  RAW("generated/video/friends-roof-digging.mp4", "friends-roof-digging (insert)"),
  // Reordered (2026-09-10, Dan: "clip at 1474 should move to 1282"): the
  // crowd's indoor reaction to falling dust now plays BEFORE the
  // extended digging shot, not after it.
  RAW("generated/video/crowd-indoor-reaction-to-dust-falling.mp4", "crowd-indoor-reaction-to-dust-falling"),
  // Reordered (2026-09-11, Dan: "clip at 1666 moves to 1474"): friends
  // watching from the roof aperture now plays BEFORE the extended
  // digging shot, not after it.
  RAW("generated/video/friends-watching-from-roof-aperture.mp4", "friends-watching-from-roof-aperture"),
  // Reordered (2026-09-11, Dan: "clip at 1762 should be moved to 1570"):
  // friends readying the ropes now plays BEFORE the extended digging
  // shot, not after it.
  RAW("generated/video/friends-ready-ropes-at-opening.mp4", "friends-ready-ropes-at-opening"),
  SHOT("b18da4bb-4f23-42c9-bbd1-b02f04cceb67", "Mark 2:3-4 -- friends dig through the roof (extended)"),
  // Reordered (2026-09-10, Dan): the overhead recast angle (same beat as
  // the lowering, per its own name) now plays BEFORE the main lowering
  // shot instead of after it.
  RAW("generated/video/pilot-shot004-recast.mp4", "pilot-shot004-recast"),
  SHOT("b6edbb4d-4643-40c0-8f16-ed5eb9730df1", "Mark 2:4 -- lower the paralytic through the roof (extended)"),
  // No longer freeze-padded (2026-09-10): enough real coverage now
  // exists (3 new inserts + Shot 1 at full length) that this group runs
  // slightly LONGER than the real 68955ms "Mark 2:1-5 (narration)" bed
  // on its own -- the bed simply finishes a little before Shot 5 begins,
  // which is fine (a brief natural pause, not an overlap).
  RAW("generated/video/paralytic-s-tearful-hope-and-crowd-silence.mp4", "paralytic-s-tearful-hope-and-crowd-silence"),
  SHOT("445d00de-7f66-494d-a104-d3e927d5dbdd", "Mark 2:5 -- Jesus forgives"),
  // Reshoot (2026-09-10, Dan: "arched roof"): the original take rendered
  // a peaked gable roof (even in its own keyframe), contradicting the
  // flat roof established everywhere else in this scene. Over-the-
  // shoulder-on-Jesus framing, matching Shot 2's established pattern.
  RAW("generated/video/crowd-witness-breathless-reaction-flatroof.mp4", "crowd-witness-breathless-reaction"),
  // Reshoot (2026-09-10, Dan: "if it is our scribe, it should be a
  // close-up, not a group shot"): the original take was a wide shot of
  // several scribes with no clear focal point under real narration --
  // replaced with a tight close-up on the Principal Scribe specifically,
  // mouth closed/still since he questions Jesus silently in his heart.
  // Freeze-padded +11083ms (native 4000ms) so this group's total still
  // exactly matches the real 19083ms "Mark 2:5-8 (narration)" bed.
  RAW("generated/video/scribe-questions-in-heart-closeup-padded.mp4", "Mark 2:6-7 -- scribe questions in heart (close-up)", false),
  SHOT("0d43887a-8c20-4271-a6d8-3cafad177558", "Mark 2:8-9 -- Jesus challenges scribes"),
  RAW("generated/video/paralytic-face-before-healing.mp4", "paralytic-face-before-healing"),
  SHOT("ea5e2ff9-c321-41f2-9c80-fd856c05d78d", "Mark 2:10-11 -- command to rise"),
  // New (2026-09-10, Dan's review note: "instant stand, need a transition
  // where he gets up"): bridges the cut from lying on the mat (end of
  // Shot 8) directly to already-standing (the astonishment insert) --
  // there was never a shot of the actual physical rising motion.
  RAW("generated/video/paralytic-rises-from-mat.mp4", "paralytic-rises-from-mat"),
  // Reshoot (2026-09-10, Dan's review note: "roof is now angled pitch"):
  // the original take (kling-926869751820460115.mp4) rendered a peaked
  // gable roof with a skylight, contradicting the flat roof established
  // by the digging shots -- replaced with a corrected flat-roof take.
  RAW("generated/video/kling-927152808813142035.mp4", "paralytic-astonishment (flat roof)"),
  // Reordered (2026-09-10, Dan: "clip at 4585 should move to 4174"): the
  // gratitude beat now plays BEFORE Shot 9 (stands, rolls bed, walks
  // out), not after the exit/celebration beats.
  RAW("generated/video/kling-926838984880947236.mp4", "paralytic-gratitude"),
  // Reordered (2026-09-11, Dan: "clip at 4803 moves to 4296"): the crowd
  // spokesperson's amazed line now plays right after gratitude, BEFORE
  // friends' happy glance and Shot 9, instead of after all the exit/
  // celebration beats.
  SHOT("27416798-3186-468a-978d-35b74297ea2f", "Mark 2:12 -- crowd spokesperson amazed"),
  // Reordered (2026-09-11, Dan: "clip at 4707 moves to 4296"): friends'
  // happy glance now plays right after gratitude, BEFORE Shot 9 (stands,
  // rolls bed, walks out), not after the exit/celebration beats.
  RAW("generated/video/friends-happy-glance.mp4", "friends-happy-glance"),
  SHOT("e84e957d-de28-4d44-9bf9-9e84cd83a2ec", "Mark 2:12 -- stands, rolls bed, walks out"),
  RAW("generated/video/kling-926868332358275129.mp4", "paralytic-exits-house"),
  RAW("generated/video/mark-2-paralytic-rear-heel-click-veo.mp4", "paralytic-heel-click-celebration"),
  RAW("generated/video/mark-2-paralytic-walks-away-applause-veo.mp4", "paralytic-walks-away-applause"),
  RAW("generated/video/scribe-unhappy-amid-celebration.mp4", "scribe-unhappy-amid-celebration"),

  // Scenes 2-4 (2026-09-11, Dan: "load the rest of Mark 2 in blender"):
  // same narrative order as assemble-full-chapter-with-inserts.ts's
  // master timeline. Gap-filler RAW inserts here carry no narration or
  // dialogue audio (per that script's AI_GENERATED_INSERT convention --
  // that stretch is meant for a music bed later, not narration), so they
  // stay muteOwnAudio=true (RAW's own default).
  SHOT("81f67f72-22b0-4ca7-84cd-addd7b42115b", "Mark 2:13 -- Jesus teaches by the sea"),
  SHOT("26d03459-0d6a-4f1d-b9e3-5239014539bf", "Mark 2:14 -- Jesus sees Matthew at the tax booth"),
  SHOT("ce87d971-d15f-4a75-b636-1c9dcb52a1fb", "Mark 2:14 -- Jesus calls Matthew"),
  RAW("generated/video/matthew-hesitates-at-his-coins-before-choosing-to-follow.mp4", "matthew-hesitates-at-his-coins-before-choosing-to-follow"),
  SHOT("097de51b-95bd-485d-952f-10e84160e13a", "Mark 2:14 -- Matthew follows Jesus"),
  SHOT("19997eba-627e-46e4-ac5b-946265fe57dc", "Mark 2:15 -- dinner at Levi's house"),
  RAW("generated/video/kling-926905441325154362.mp4", "matthew-serving-bread-and-drink-to-jesus-and-guests"),
  RAW("generated/video/disciples-observe-scribes-murmuring-at-doorway.mp4", "disciples-observe-scribes-murmuring-at-doorway"),
  SHOT("9101333a-d2ef-4067-ae4d-c47fc0d398d2", "Mark 2:16 -- scribes watch with disapproval"),
  SHOT("462acce5-2fd3-41df-a38f-872e29a891f3", "Mark 2:16 -- scribe questions the disciples"),
  SHOT("cb1856ec-2e9f-4ba7-804c-a758da8c20d5", "Mark 2:17 -- Jesus answers the scribes"),
  RAW("generated/video/matthew-and-disciples-reacting-at-table.mp4", "matthew-and-disciples-reacting-at-table"),
  SHOT("8afd8f47-6a49-43ee-8b97-74598a000331", "Mark 2:18 -- questioners approach about fasting"),
  RAW("generated/video/scribes-observing-near-doorway.mp4", "scribes-observing-near-doorway"),
  SHOT("f26b7be7-3801-4b47-8d38-a8ada38aa981", "Mark 2:18 -- spokesperson asks about fasting"),
  SHOT("9a1b2acb-6da9-4291-a4e1-5cbd78629e2c", "Mark 2:19 -- Jesus answers about the bridegroom"),
  RAW("generated/video/disciples-react-warmly-to-jesus-wedding-analogy.mp4", "disciples-react-warmly-to-jesus-wedding-analogy"),
  RAW("generated/video/questioners-processing-jesus-counter-question.mp4", "questioners-processing-jesus-counter-question"),
  SHOT("9c291cdd-389e-45db-b737-866543d730c6", "Mark 2:20 -- the bridegroom taken away"),
  SHOT("44009342-73b8-4b8a-ad46-085d64253258", "Mark 2:21 -- parable of the unshrunk cloth"),
  SHOT("8209a47b-eaa0-4dcd-9a43-e3a9afd2e369", "Mark 2:22 -- parable of new wine"),
  SHOT("7b719b16-ee4d-4d6a-90ff-3c22327f1a86", "Mark 2:23 -- disciples pluck grain in the field"),
  RAW("generated/video/close-up-of-peter-rubbing-grain-and-chaff.mp4", "close-up-of-peter-rubbing-grain-and-chaff"),
  RAW("generated/video/scribes-watch-in-silent-disapproval.mp4", "scribes-watch-in-silent-disapproval"),
  SHOT("94a721a3-1fc6-44d1-a9e2-9021e26ec408", "Mark 2:24 -- scribe questions the Sabbath act"),
  SHOT("cef5e711-3d67-4b5c-aff1-4315587c6e23", "Mark 2:25-26 -- David and the bread of the Presence"),
  SHOT("96199814-0884-4a4a-bd95-b84950fce4fd", "Mark 2:27-28 -- the Sabbath was made for man"),
  RAW("generated/video/kling-926911320539140170.mp4", "peter-s-reverent-reflection")
];

// Real continuous audio that spans multiple video segments above,
// independent of their individual cut points. sourceStartMs is the
// offset INTO the source audio file (not the timeline) -- e.g. this
// narration line starts 76458ms into the shared vocals.mp3 file.
interface AudioBed {
  label: string;
  sourceAbsPath: string;
  sourceStartMs: number;
  timelineStartMs: number; // set below once video segment timings are known
  durationMs: number;
}
const audioBedDefs: Array<Omit<AudioBed, "timelineStartMs"> & { afterLabel: string | null }> = [
  {
    label: "Mark 2:1-5 (narration)",
    sourceAbsPath: join(dataDir, "assets", "source/hatam/mark-2/separated/vocals.mp3"),
    sourceStartMs: 0,
    durationMs: 68955,
    // Dan: the two establishing/pilot-intro shots are silent-narration --
    // "The narrator does not speak during those" -- so the real narration
    // starts right after they end, not at timeline 0.
    afterLabel: "pilot-intro-2 (street scene)"
  },
  {
    label: "Mark 2:5-8 (narration)",
    sourceAbsPath: join(dataDir, "assets", "source/hatam/mark-2/separated/vocals.mp3"),
    sourceStartMs: 76458,
    durationMs: 19083,
    afterLabel: "Mark 2:5 -- Jesus forgives" // starts right after this segment ends
  }
];

const jsonMode = process.argv.includes("--json");

let cursorMs = 0;
const videoSegments: Array<{ label: string; absPath: string; durationMs: number; hasAudio: boolean; muteOwnAudio: boolean; startMs: number; endMs: number }> =
  [];
if (!jsonMode) {
  console.log("seq | label | durationMs | hasAudio | muteOwnAudio | startMs | endMs");
  console.log("-".repeat(100));
}
for (const seg of sequence) {
  let absPath: string;
  let durationMs: number;
  if (seg.kind === "shot") {
    const clip = byShotId.get(seg.shotId);
    if (!clip) {
      if (!jsonMode) console.log(`MISSING clip for shot ${seg.shotId} (${seg.label})`);
      continue;
    }
    absPath = join(dataDir, "assets", clip.result_asset_path);
    // Use the REAL file duration, not the DB's timeline_end_ms -
    // timeline_start_ms -- found 2026-09-10 (Dan caught it by ear) that
    // Shot 5 and Shot 10's accepted clips are genuinely only ~5.04s long
    // (a shorter regenerated take) while the DB still recorded their
    // original longer duration (7523ms / 7882ms). Trusting the stale DB
    // value made both pipelines extend past the real content -- in
    // Blender this freezes on the last frame in silence; in the ffmpeg
    // pipeline `-t` on a too-short source just produces a shorter
    // segment than intended, silently shifting everything after it.
    const dbDurationMs = clip.timeline_end_ms - clip.timeline_start_ms;
    const realDurationMs = ffprobeDurationMs(absPath);
    if (Math.abs(dbDurationMs - realDurationMs) > 100 && !jsonMode) {
      console.log(`  NOTE: ${seg.label} DB duration ${dbDurationMs}ms != real file duration ${realDurationMs}ms -- using real duration.`);
    }
    durationMs = seg.durationMsOverride ?? realDurationMs;
  } else {
    absPath = join(dataDir, "assets", seg.relPath);
    durationMs = seg.durationMsOverride ?? ffprobeDurationMs(absPath);
  }
  const audio = hasAudio(absPath);
  const muteOwnAudio = seg.kind === "raw" ? (seg.muteOwnAudio ?? true) : false;
  if (!jsonMode) console.log(`${seg.label} | ${durationMs}ms | audio=${audio} | mute=${muteOwnAudio} | ${cursorMs}ms -> ${cursorMs + durationMs}ms`);
  videoSegments.push({ label: seg.label, absPath, durationMs, hasAudio: audio, muteOwnAudio, startMs: cursorMs, endMs: cursorMs + durationMs });
  cursorMs += durationMs;
}

const audioBeds: AudioBed[] = audioBedDefs.map((def) => {
  const { afterLabel, ...rest } = def;
  if (afterLabel === null) {
    return { ...rest, timelineStartMs: 0 };
  }
  const after = videoSegments.find((v) => v.label === afterLabel);
  if (!after) throw new Error(`audioBed "${def.label}": afterLabel "${afterLabel}" not found in videoSegments`);
  return { ...rest, timelineStartMs: after.endMs };
});

if (jsonMode) {
  console.log(JSON.stringify({ videoSegments, audioBeds }, null, 2));
} else {
  console.log("-".repeat(100));
  console.log(`Total: ${(cursorMs / 1000).toFixed(1)}s`);
  console.log("\nAudio beds:");
  for (const bed of audioBeds) {
    console.log(`  ${bed.label}: timeline ${bed.timelineStartMs}ms -> ${bed.timelineStartMs + bed.durationMs}ms (source offset ${bed.sourceStartMs}ms)`);
  }
}
