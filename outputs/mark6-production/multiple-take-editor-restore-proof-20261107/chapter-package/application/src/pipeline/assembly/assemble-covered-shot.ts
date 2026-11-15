/**
 * Assembles one covered_sequence shot's beat clips into a single
 * continuous, reviewable video -- built 2026-09-09 straight out of the
 * Scene 1 Shot 7 pilot, which surfaced two real problems this module
 * exists to fix:
 *
 * 1. Every raw generated clip runs LONGER than its beat actually needs --
 *    Veo's 4s floor overruns a ~3s cutaway, and Kling's Avatar API
 *    returned a fixed 7.2s for both lip-sync beats regardless of the
 *    5.76s of audio actually requested (confirmed empirically; still
 *    unclear whether Kling's lip-sync stays accurate for the full 7.2s or
 *    only the real ~5.76s of it -- trimming to the beat's own exact
 *    duration sidesteps that question by only ever using the portion we
 *    know is correct: the start, which is what every provider actually
 *    animated FROM).
 * 2. Different providers return different formats -- confirmed 720p/24fps
 *    (Veo), 360p/24fps (Omni's draft fallback), and 720p/30fps (Kling),
 *    which ffmpeg's concat demuxer can't just concatenate as-is.
 *
 * This is scoped to ONE shot's own beats stitched into one silent picture
 * track, then that picture is muxed against the shot's real
 * composite_cast_master dialogue (an L-cut: the audio never resets or
 * repeats across the cut points, only the picture changes) -- NOT the
 * full chapter-level stage 6 assembly (src/pipeline/assembly/index.ts,
 * still a stub), which additionally has to place shots against the
 * spaced_production timeline layer with editorial gaps between scenes.
 * Every provider's own audio track is dropped (-an on each trimmed clip)
 * per PRODUCT_VISION.md's Three-Layer Audio Architecture -- provider
 * video audio is always muted in the edit; only the real dialogue plays.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolveSpeechRunCastAudio } from "../voice-lipsync/speech-run-audio.js";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import { parseVerseRange } from "../scene-breakdown/build-scenes.js";
import { verseRangesRelated } from "../casting/coverage.js";

// 720p/24fps -- Veo's own defaults, kept as the assembly target since
// that's the intended top quality tier; a 360p draft-fallback beat gets
// upscaled to match (visibly softer for that beat, an honest quality
// tradeoff of the fallback, not something this step can fix).
const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 24;

interface ClipRow {
  id: string;
  timeline_start_ms: number;
  timeline_end_ms: number;
  result_asset_path: string;
}

function normalizeAndTrim(sourcePath: string, durationMs: number, outPath: string): void {
  const durationSec = (durationMs / 1000).toFixed(3);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      sourcePath,
      "-t",
      durationSec,
      "-vf",
      // "increase" + centered crop (fill/cover), not "decrease" + pad --
      // confirmed necessary 2026-09-09: a lip-sync beat cropped tight on
      // one character (see crop-keyframe.ts) can come back from Kling in
      // a very different aspect ratio (a portrait 784x1152 crop stayed
      // portrait through Kling's Avatar API), and "decrease"+pad left
      // thick black bars on both sides instead of a normal-looking
      // close-up filling the frame.
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=${TARGET_FPS}`,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
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

/** Exact decoded frame count -- `-count_frames` actually decodes and
 *  tallies every frame rather than trusting a container-level `nb_frames`
 *  tag (which can be an estimate). See assemble-single-shot.ts's
 *  identical helper: comparing DURATION tags (even stream-level ones)
 *  was itself a source of the original bug this fixes, because a `-t`-
 *  based cutoff has real run-to-run timing jitter with a threaded
 *  encoder -- re-running the IDENTICAL trim command against the
 *  IDENTICAL source produced different frame counts from one run to the
 *  next. A frame COUNTER (`-frames:v`) doesn't have that problem. */
function ffprobeFrameCount(absPath: string): number {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v", "-count_frames", "-show_entries", "stream=nb_read_frames", "-of", "default=noprint_wrappers=1:nokey=1", absPath],
    { encoding: "utf-8" }
  );
  const frameCount = out.trim().split("\n").at(0);
  if (!frameCount) throw new Error(`ffprobe returned no frame count for ${absPath}`);
  return parseInt(frameCount, 10);
}

/** Conforms the concat-demuxer's output to EXACTLY `durationMs`,
 *  deterministically -- confirmed live (2026-09-10, Dan noticed a few
 *  clips felt "off by a fraction of a second"): each beat's own
 *  `-t`-based trim in normalizeAndTrim has real timing jitter (see
 *  ffprobeFrameCount's comment), and that per-beat imprecision then ADDS
 *  UP across every beat in a covered_sequence shot (confirmed on Scene 1
 *  Shot 8: 4 beats, ~140ms short overall -- roughly one frame per beat).
 *  Targets an exact frame count via `-frames:v` rather than a timestamp,
 *  and pads any genuine shortfall by cloning the last frame (imperceptible
 *  at this magnitude) rather than let the real dialogue audio outrun
 *  picture that already stopped moving. */
function forceExactDuration(sourcePath: string, durationMs: number, outPath: string): void {
  const targetFrames = Math.round((durationMs / 1000) * TARGET_FPS);
  const actualFrames = ffprobeFrameCount(sourcePath);
  if (actualFrames >= targetFrames) {
    execFileSync(
      "ffmpeg",
      ["-y", "-i", sourcePath, "-frames:v", String(targetFrames), "-c:v", "libx264", "-preset", "medium", "-crf", "18", outPath],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    return;
  }
  const deficitMs = ((targetFrames - actualFrames) / TARGET_FPS) * 1000;
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      sourcePath,
      "-vf",
      `tpad=stop_mode=clone:stop_duration=${(deficitMs / 1000).toFixed(3)}`,
      "-frames:v",
      String(targetFrames),
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      outPath
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
}

/** Re-encodes with an explicit `-frames:v` target rather than `-c:v copy`
 *  + `-shortest` -- see assemble-single-shot.ts's identical fix: stream-
 *  copying the (already frame-accurate) video while `-shortest` trims
 *  against the audio can only cut at whatever packet/GOP boundary the
 *  copied stream already has, which undid forceExactDuration's fix right
 *  back to the same drift when this was still `-c:v copy`. */
function muxAudio(videoPath: string, audioPath: string, audioStartMs: number, audioDurationMs: number, durationMs: number, outPath: string): void {
  const targetFrames = Math.round((durationMs / 1000) * TARGET_FPS);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      videoPath,
      "-ss",
      String(audioStartMs / 1000),
      "-t",
      String(audioDurationMs / 1000),
      "-i",
      audioPath,
      "-frames:v",
      String(targetFrames),
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

export interface AssembleResult {
  shotId: string;
  assembledVideoPath: string; // relative to assets/, includes muxed dialogue audio
  totalDurationMs: number;
  clipCount: number;
}

interface CoveredShotAudio {
  sourcePath: string;
  startMs: number;
  endMs: number;
}

/** The producer-approved utterance binding is the audio identity. Composite
 * rows need not carry a verse label, and a verse can contain several lines. */
export function resolveCoveredShotAudio(db: DatabaseSync, shotId: string, totalDurationMs: number): CoveredShotAudio {
  const continuous = resolveSpeechRunCastAudio(db, shotId);
  if (continuous) {
    if (Math.abs(continuous.endMs - continuous.startMs - totalDurationMs) > 100) throw new Error(`Covered shot ${shotId} picture duration does not match its approved cast-master utterance.`);
    return { sourcePath: continuous.path, startMs: continuous.startMs, endMs: continuous.endMs };
  }
  const binding = db.prepare("SELECT id FROM shot_utterance_bindings WHERE shot_id=?").get(shotId);
  if (binding) {
    const matches = db.prepare(`SELECT a.source_path, a.start_ms AS composite_start, a.end_ms AS composite_end,
        o.start_ms AS original_start, o.end_ms AS original_end,
        ub.source_start_ms, ub.source_end_ms, ub.source_hash AS binding_hash,
        m.source_hash AS mapped_hash
      FROM shot_utterance_bindings ub
      JOIN shots sh ON sh.id=ub.shot_id
      JOIN scenes sc ON sc.id=sh.scene_id
      JOIN audio_segments o ON o.id=ub.source_audio_segment_id AND o.project_id=sc.project_id AND o.layer='original_reading'
      JOIN composite_audio_source_map m ON m.original_segment_id=o.id
      JOIN audio_segments a ON a.id=m.composite_segment_id AND a.project_id=sc.project_id
        AND a.layer='composite_cast_master' AND a.speaker_character_id=sh.dialogue_character_id
      WHERE ub.shot_id=?`).all(shotId) as Array<{
        source_path: string; composite_start: number; composite_end: number;
        original_start: number; original_end: number; source_start_ms: number; source_end_ms: number;
        binding_hash: string; mapped_hash: string;
      }>;
    if (matches.length !== 1 || matches[0]!.binding_hash !== matches[0]!.mapped_hash) {
      throw new Error(`Covered shot ${shotId} lacks one current cast-master segment matching its approved source binding.`);
    }
    const row = matches[0]!;
    const originalDuration = row.original_end - row.original_start;
    const compositeDuration = row.composite_end - row.composite_start;
    if (originalDuration <= 0 || compositeDuration <= 0 || row.source_start_ms < row.original_start || row.source_end_ms > row.original_end || row.source_end_ms <= row.source_start_ms) {
      throw new Error(`Covered shot ${shotId} has invalid approved audio bounds.`);
    }
    const startMs = row.composite_start + Math.round((row.source_start_ms - row.original_start) * compositeDuration / originalDuration);
    const endMs = row.composite_start + Math.round((row.source_end_ms - row.original_start) * compositeDuration / originalDuration);
    if (endMs <= startMs || Math.abs(endMs - startMs - totalDurationMs) > 100) {
      throw new Error(`Covered shot ${shotId} picture duration does not match its approved cast-master utterance.`);
    }
    return { sourcePath: row.source_path, startMs, endMs };
  }

  // Legacy covered shots predate explicit utterance bindings. Keep their
  // existing verse lookup, but never use it to bypass a stale binding above.
  const shot = db.prepare("SELECT verse_ref,dialogue_character_id FROM shots WHERE id=?").get(shotId) as
    { verse_ref: string | null; dialogue_character_id: string | null } | undefined;
  if (!shot?.dialogue_character_id || !shot.verse_ref) throw new Error(`Shot ${shotId} has no dialogue identity for cast-master audio.`);
  const { start: verseStart, end: verseEnd } = parseVerseRange(shot.verse_ref);
  const rows = db.prepare(`SELECT source_path,verse_ref,start_ms,end_ms FROM audio_segments
    WHERE layer='composite_cast_master' AND speaker_character_id=? AND verse_ref IS NOT NULL`)
    .all(shot.dialogue_character_id) as Array<{ source_path: string; verse_ref: string; start_ms: number; end_ms: number }>;
  const matches = rows.filter(s => verseRangesRelated(parseVerseRange(s.verse_ref), { start: verseStart, end: verseEnd }));
  if (matches.length !== 1) throw new Error(`Covered shot ${shotId} has ${matches.length} matching legacy cast-master segments; expected exactly one.`);
  return { sourcePath: matches[0]!.source_path, startMs: matches[0]!.start_ms, endMs: matches[0]!.end_ms };
}

/**
 * Reads every clips row for one shot (ordered by timeline_start_ms),
 * verifies they cover [0, total) with no gaps or overlaps, trims each to
 * its own exact beat duration and normalizes format, concatenates them
 * into one silent picture track, then muxes in the shot's real
 * composite_cast_master dialogue audio. Records the result as a new
 * generation_attempts row (provider='local', operation='assemble_shot',
 * cost 0) and a new clips row spanning the whole shot -- the per-beat
 * clips already in the table are left untouched as real provenance/
 * history, not replaced.
 */
export function assembleCoveredSequenceShot(db: DatabaseSync, shotId: string): AssembleResult {
  const dataDir = getDataDir();

  const clips = db
    .prepare(
      `SELECT cl.id, cl.timeline_start_ms, cl.timeline_end_ms, ga.result_asset_path
       FROM clips cl JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id
       WHERE cl.shot_id = ? AND ga.operation != 'assemble_shot'
       ORDER BY cl.timeline_start_ms`
    )
    .all(shotId) as unknown as ClipRow[];
  if (clips.length === 0) throw new Error(`No clips found for shot ${shotId} -- generate its beats first.`);

  let cursor = 0;
  for (const clip of clips) {
    if (clip.timeline_start_ms !== cursor) {
      throw new Error(
        `Clip gap/overlap for shot ${shotId}: expected the next clip to start at ${cursor}ms, but clip ${clip.id} starts at ${clip.timeline_start_ms}ms.`
      );
    }
    if (clip.timeline_end_ms <= clip.timeline_start_ms) {
      throw new Error(`Clip ${clip.id} has a non-positive duration (${clip.timeline_start_ms}-${clip.timeline_end_ms}ms).`);
    }
    cursor = clip.timeline_end_ms;
  }
  const totalDurationMs = cursor;

  const audioSeg = resolveCoveredShotAudio(db, shotId, totalDurationMs);

  const tmpDir = mkdtempSync(join(tmpdir(), "heartword-assemble-"));
  try {
    const trimmedPaths: string[] = [];
    for (const clip of clips) {
      const durationMs = clip.timeline_end_ms - clip.timeline_start_ms;
      const sourcePath = join(dataDir, "assets", clip.result_asset_path);
      const trimmedPath = join(tmpDir, `${clip.id}.mp4`);
      normalizeAndTrim(sourcePath, durationMs, trimmedPath);
      trimmedPaths.push(trimmedPath);
    }

    const silentPath = join(tmpDir, "silent-concat.mp4");
    concatClips(trimmedPaths, silentPath, tmpDir);

    const exactSilentPath = join(tmpDir, "silent-exact.mp4");
    forceExactDuration(silentPath, totalDurationMs, exactSilentPath);

    const audioAbsPath = join(dataDir, "assets", audioSeg.sourcePath);
    const relPath = join("generated", "assembled", `${shotId}-${randomUUID()}.mp4`);
    const outPath = join(dataDir, "assets", relPath);
    mkdirSync(join(dataDir, "assets", "generated", "assembled"), { recursive: true });
    muxAudio(exactSilentPath, audioAbsPath, audioSeg.startMs, audioSeg.endMs - audioSeg.startMs, totalDurationMs, outPath);

    const attemptId = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO generation_attempts
         (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
       VALUES (?, ?, 'local', 'ffmpeg-concat', 'assemble_shot', ?, NULL, 'accepted', ?, 0, ?)`
    ).run(attemptId, shotId, `${TARGET_WIDTH}x${TARGET_HEIGHT}`, relPath, now);
    db.prepare(
      `INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, 0, ?, ?)`
    ).run(randomUUID(), shotId, attemptId, totalDurationMs, now);

    return { shotId, assembledVideoPath: relPath, totalDurationMs, clipCount: clips.length };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
