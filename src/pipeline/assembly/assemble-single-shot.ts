/**
 * Assembles ONE single_clip shot's raw generated video into its final
 * deliverable form -- the single_clip counterpart to
 * assemble-covered-shot.ts, but simpler: there is exactly one raw clip
 * (no beats to stitch), so this only needs to trim it to its own real
 * target duration, normalize format, and (for a needs_lip_sync shot)
 * mux in the shot's real composite_cast_master dialogue audio in place
 * of the provider's own muted track -- same Three-Layer Audio
 * Architecture rule already applied to every covered_sequence beat:
 * provider video audio is always dropped, only real dialogue plays.
 *
 * A shot without needs_lip_sync has no dialogue audio to mux at all --
 * its final clip stays silent (an -an trim/normalize only) until stage
 * 6 (still a stub) places it against the spaced_production narration
 * layer.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import { parseVerseRange } from "../scene-breakdown/build-scenes.js";
import { verseRangesRelated } from "../casting/coverage.js";

const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 24;

interface ShotRow {
  needs_lip_sync: number;
  dialogue_character_id: string | null;
  verse_ref: string | null;
}

interface RawClipRow {
  id: string;
  timeline_start_ms: number;
  timeline_end_ms: number;
  result_asset_path: string;
}

/** Exact decoded frame count -- `-count_frames` actually decodes and
 *  tallies every frame rather than trusting a container-level `nb_frames`
 *  tag (which can be an estimate), so this is the ground truth to
 *  compare against `targetFrames` below rather than back-deriving a
 *  frame count from a duration tag (itself sometimes rounded/estimated,
 *  which is exactly what caused the original bug this function fixes). */
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

/** Trims/scales the raw clip to EXACTLY `durationMs`, deterministically --
 *  confirmed live (2026-09-10, Dan noticed a few clips felt "off by a
 *  fraction of a second"): `-t durationSec` is a PTS-based cutoff, and
 *  re-running the IDENTICAL command against the IDENTICAL source
 *  produced a DIFFERENT frame count from one run to the next (116 frames
 *  one time, 120 the next, on the same 5033ms source trimmed to a
 *  4991ms target) -- real timing jitter in how libx264's threaded
 *  encoder + the `fps=24` filter flush frames near a PTS cutoff, not
 *  something a single retry or a bigger safety margin fixes reliably.
 *  `-frames:v <N>` sidesteps this entirely: it's a plain frame counter,
 *  not a timestamp comparison, so asking for exactly
 *  round(durationMs/1000 * 24) frames lands on that count every time
 *  regardless of encoder timing. Falls back to padding (cloning the
 *  last frame) only in the genuine edge case where the source doesn't
 *  have enough frames after conversion to hit the target at all. */
function normalizeAndTrim(sourcePath: string, durationMs: number, outPath: string): void {
  const targetFrames = Math.round((durationMs / 1000) * TARGET_FPS);
  const firstPassPath = `${outPath}.pass1.mp4`;
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      sourcePath,
      "-vf",
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=${TARGET_FPS}`,
      "-frames:v",
      String(targetFrames),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      firstPassPath
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );

  const actualFrames = ffprobeFrameCount(firstPassPath);
  if (actualFrames >= targetFrames) {
    rmSync(outPath, { force: true });
    renameSync(firstPassPath, outPath);
    return;
  }
  // Genuine source shortfall (fewer real frames existed than requested)
  // -- pad the deficit by cloning the last frame. Computed from the
  // frame-count gap directly, not a duration tag, for the same reason
  // ffprobeFrameCount exists at all.
  const deficitMs = ((targetFrames - actualFrames) / TARGET_FPS) * 1000;
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      firstPassPath,
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
  rmSync(firstPassPath, { force: true });
}

/** `-c:v copy` + `-shortest` was the OTHER half of the drift bug
 *  normalizeAndTrim's header comment describes: even after that function
 *  hands this an exactly frame-accurate video, stream-copying it while
 *  `-shortest` truncates against the audio's own length can only cut at
 *  whatever packet/GOP boundary the copied stream already has, not at an
 *  arbitrary exact frame -- confirmed live, it undid normalizeAndTrim's
 *  fix right back to the same ~150ms deficit. Re-encoding here with an
 *  explicit `-frames:v` target (from the same durationMs everything else
 *  in this file already agrees on) makes the FINAL muxed file itself
 *  frame-accurate, instead of depending on an upstream file's frame
 *  count surviving a stream-copy trim unmodified. */
function muxAudio(videoPath: string, audioPath: string, audioStartSec: string, audioDurationSec: string, durationMs: number, outPath: string): void {
  const targetFrames = Math.round((durationMs / 1000) * TARGET_FPS);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      videoPath,
      "-ss",
      audioStartSec,
      "-t",
      audioDurationSec,
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

export interface AssembleSingleShotResult {
  shotId: string;
  assembledVideoPath: string;
  durationMs: number;
  hasDialogueAudio: boolean;
}

export function assembleSingleShot(db: DatabaseSync, shotId: string): AssembleSingleShotResult {
  const dataDir = getDataDir();

  // Ordered by the generation attempt's own created_at, not
  // cl.timeline_start_ms -- confirmed live as a real bug (2026-09-10):
  // every raw clip for a single_clip shot starts at timeline_start_ms=0,
  // so when a shot gets re-generated (e.g. the Production Director's
  // extend_existing authority regenerating a shot at a longer duration),
  // ordering by timeline_start_ms DESC can't break the tie between the
  // old and new attempt -- SQLite's tie-break without a secondary sort
  // key isn't guaranteed to favor the newer row, and it picked the STALE
  // 4s attempt over a freshly-generated 8s one in practice.
  const clip = db
    .prepare(
      `SELECT cl.id, cl.timeline_start_ms, cl.timeline_end_ms, ga.result_asset_path
       FROM clips cl JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id
       WHERE cl.shot_id = ? AND ga.operation != 'assemble_shot'
       ORDER BY ga.created_at DESC LIMIT 1`
    )
    .get(shotId) as RawClipRow | undefined;
  if (!clip) throw new Error(`No raw clip found for shot ${shotId} -- generate it first.`);

  const durationMs = clip.timeline_end_ms - clip.timeline_start_ms;
  if (durationMs <= 0) throw new Error(`Clip for shot ${shotId} has a non-positive duration.`);

  const shot = db.prepare(`SELECT needs_lip_sync, dialogue_character_id, verse_ref FROM shots WHERE id = ?`).get(shotId) as ShotRow | undefined;
  if (!shot) throw new Error(`Shot ${shotId} not found.`);

  const tmpDir = mkdtempSync(join(tmpdir(), "heartword-single-assemble-"));
  try {
    const trimmedPath = join(tmpDir, "trimmed.mp4");
    normalizeAndTrim(join(dataDir, "assets", clip.result_asset_path), durationMs, trimmedPath);

    const relPath = join("generated", "assembled", `${shotId}.mp4`);
    const outPath = join(dataDir, "assets", relPath);
    mkdirSync(join(dataDir, "assets", "generated", "assembled"), { recursive: true });

    let hasDialogueAudio = false;
    if (shot.needs_lip_sync && shot.dialogue_character_id && shot.verse_ref) {
      const { start: verseStart, end: verseEnd } = parseVerseRange(shot.verse_ref);
      const audioRows = db
        .prepare(
          `SELECT source_path, verse_ref, start_ms, end_ms FROM audio_segments
           WHERE layer = 'composite_cast_master' AND speaker_character_id = ? AND verse_ref IS NOT NULL`
        )
        .all(shot.dialogue_character_id) as Array<{ source_path: string; verse_ref: string; start_ms: number; end_ms: number }>;
      let matches = audioRows.filter((s) => verseRangesRelated(parseVerseRange(s.verse_ref), { start: verseStart, end: verseEnd }));

      // Fallback: some shots cast a specific individual (e.g. "Crowd
      // witness (stern man, spokesperson)") for dialogue that was
      // actually voiced under a broader group character (e.g. "Eight
      // recurring witnesses + adolescent, Mark 2 (crowd)") -- a real,
      // confirmed mismatch between shots.dialogue_character_id and
      // audio_segments.speaker_character_id, not a bug in this lookup.
      // Retried by an EXACT verse_ref string match (not verseRangesRelated
      // containment) when the character-scoped query finds nothing --
      // containment is too loose here: a single-verse shot like "Mark
      // 2:12" numerically sits inside both the preceding narration range
      // ("Mark 2:11-12 (narration)") and the following one ("Mark
      // 2:12-14 (narration)") as their shared boundary point, so relaxing
      // to containment (rather than the same verse LABEL) pulled in
      // narration rows that aren't this shot's real dialogue.
      if (matches.length === 0) {
        matches = db
          .prepare(`SELECT source_path, verse_ref, start_ms, end_ms FROM audio_segments WHERE layer = 'composite_cast_master' AND verse_ref = ?`)
          .all(shot.verse_ref) as Array<{ source_path: string; verse_ref: string; start_ms: number; end_ms: number }>;
      }

      if (matches.length === 0) {
        throw new Error(`No composite_cast_master audio_segments row found for shot ${shotId} (${shot.verse_ref}).`);
      }
      if (matches.length > 1) {
        throw new Error(
          `Ambiguous composite_cast_master match for shot ${shotId} (${shot.verse_ref}): ${matches.length} rows matched.`
        );
      }
      const seg = matches[0]!;
      const audioAbsPath = join(dataDir, "assets", seg.source_path);
      muxAudio(trimmedPath, audioAbsPath, (seg.start_ms / 1000).toFixed(3), (durationMs / 1000).toFixed(3), durationMs, outPath);
      hasDialogueAudio = true;
    } else {
      execFileSync("ffmpeg", ["-y", "-i", trimmedPath, "-c", "copy", outPath], { stdio: ["ignore", "ignore", "pipe"] });
    }

    const attemptId = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO generation_attempts
         (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
       VALUES (?, ?, 'local', 'ffmpeg-assemble', 'assemble_shot', ?, NULL, 'accepted', ?, 0, ?)`
    ).run(attemptId, shotId, `${TARGET_WIDTH}x${TARGET_HEIGHT}`, relPath, now);
    db.prepare(
      `INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, 0, ?, ?)`
    ).run(randomUUID(), shotId, attemptId, durationMs, now);

    return { shotId, assembledVideoPath: relPath, durationMs, hasDialogueAudio };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
