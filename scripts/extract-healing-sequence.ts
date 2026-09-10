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
  // Reused as the "people start to gather, curious" beat (Dan's clip 4)
  // during the real ~1.6s recorded pause -- trimmed to 1593ms (measured
  // pause: 2.926s-4.519s) so the cut to Shot 2 lands exactly when verse
  // narration resumes.
  SHOT("f6386c84-b0b0-404d-b080-faa644443f72", "Mark 2:1-2 -- crowd blocks the doorway", 1593),
  // Reshoot (2026-09-10): the original Shot 2 take showed Jesus's face/
  // lips directly, which doesn't work now that this beat plays under
  // real narration (not lip-synced dialogue) rather than his own
  // dialogue -- replaced with an over-the-shoulder take that never shows
  // his mouth. Ad-hoc insert; the DB-tracked shots.8d9ac62b record and
  // the ffmpeg chapter-assembly pipeline are untouched.
  RAW("generated/video/shot2-jesus-preaches-over-shoulder.mp4", "Mark 2:2 -- Jesus preaches to the crowd (over-the-shoulder)", false),
  RAW("generated/video/friends-carrying-to-house.mp4", "friends-carrying-to-house"),
  RAW("generated/video/friends-roof-arrival.mp4", "friends-roof-arrival"),
  SHOT("b18da4bb-4f23-42c9-bbd1-b02f04cceb67", "Mark 2:3-4 -- friends dig through the roof (extended)"),
  RAW("generated/video/friends-roof-digging.mp4", "friends-roof-digging (insert)"),
  RAW("generated/video/crowd-indoor-reaction-to-dust-falling.mp4", "crowd-indoor-reaction-to-dust-falling"),
  RAW("generated/video/friends-watching-from-roof-aperture.mp4", "friends-watching-from-roof-aperture"),
  SHOT("b6edbb4d-4643-40c0-8f16-ed5eb9730df1", "Mark 2:4 -- lower the paralytic through the roof (extended)"),
  RAW("generated/video/pilot-shot004-recast.mp4", "pilot-shot004-recast"),
  // Freeze-padded +8436ms (scripts/pad-clip-freeze-frame.ts) so this
  // group's total video exactly matches the real 68955ms "Mark 2:1-5
  // (narration)" bed below -- without this, Shot 5's own dialogue starts
  // 8436ms too early and overlaps the still-playing narration bed. Found
  // 2026-09-10 after Dan caught the same underlying bug in the ffmpeg
  // pipeline (see build-mark-2-1-5-narration-block.ts).
  RAW("generated/video/paralytic-s-tearful-hope-and-crowd-silence-padded.mp4", "paralytic-s-tearful-hope-and-crowd-silence"),
  SHOT("445d00de-7f66-494d-a104-d3e927d5dbdd", "Mark 2:5 -- Jesus forgives"),
  RAW("generated/video/crowd-witness-breathless-reaction.mp4", "crowd-witness-breathless-reaction"),
  // Freeze-padded +7083ms, same fix as above but for the "Mark 2:5-8
  // (narration)" bed -- also needed once friends-watching-from-roof-
  // aperture (originally part of this group) moved to the digging beat,
  // which increased this group's own shortfall. Ad-hoc padded file, not
  // the DB-tracked shots.fe9886dc record.
  RAW("generated/video/shot6-scribe-questions-padded.mp4", "Mark 2:6-7 -- scribe questions in heart (extended)", false),
  SHOT("0d43887a-8c20-4271-a6d8-3cafad177558", "Mark 2:8-9 -- Jesus challenges scribes"),
  RAW("generated/video/paralytic-face-before-healing.mp4", "paralytic-face-before-healing"),
  SHOT("ea5e2ff9-c321-41f2-9c80-fd856c05d78d", "Mark 2:10-11 -- command to rise"),
  RAW("generated/video/kling-926869751820460115.mp4", "paralytic-astonishment"),
  SHOT("e84e957d-de28-4d44-9bf9-9e84cd83a2ec", "Mark 2:12 -- stands, rolls bed, walks out"),
  RAW("generated/video/kling-926868332358275129.mp4", "paralytic-exits-house"),
  RAW("generated/video/mark-2-paralytic-rear-heel-click-veo.mp4", "paralytic-heel-click-celebration"),
  RAW("generated/video/mark-2-paralytic-walks-away-applause-veo.mp4", "paralytic-walks-away-applause"),
  RAW("generated/video/kling-926838984880947236.mp4", "paralytic-gratitude"),
  RAW("generated/video/friends-happy-glance.mp4", "friends-happy-glance"),
  SHOT("27416798-3186-468a-978d-35b74297ea2f", "Mark 2:12 -- crowd spokesperson amazed"),
  RAW("generated/video/scribe-unhappy-amid-celebration.mp4", "scribe-unhappy-amid-celebration")
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
    durationMs = seg.durationMsOverride ?? clip.timeline_end_ms - clip.timeline_start_ms;
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
