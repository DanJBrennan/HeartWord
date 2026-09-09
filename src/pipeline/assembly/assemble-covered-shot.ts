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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import { parseVerseRange } from "../scene-breakdown/build-scenes.js";

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

function muxAudio(videoPath: string, audioPath: string, outPath: string): void {
  execFileSync(
    "ffmpeg",
    ["-y", "-i", videoPath, "-i", audioPath, "-c:v", "copy", "-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0", "-shortest", outPath],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
}

export interface AssembleResult {
  shotId: string;
  assembledVideoPath: string; // relative to assets/, includes muxed dialogue audio
  totalDurationMs: number;
  clipCount: number;
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

  const shot = db.prepare(`SELECT verse_ref, dialogue_character_id FROM shots WHERE id = ?`).get(shotId) as
    | { verse_ref: string | null; dialogue_character_id: string | null }
    | undefined;
  if (!shot?.dialogue_character_id) {
    throw new Error(`Shot ${shotId} has no dialogue_character_id -- can't find its composite_cast_master audio.`);
  }
  // Same verse-range-overlap match casting/index.ts and
  // build-coverage-manifest.ts already use -- see coverage.ts's docstring
  // for why this is the shared pattern rather than an exact string match.
  const { start: verseStart, end: verseEnd } = parseVerseRange(shot.verse_ref!);
  const audioRows = db
    .prepare(
      `SELECT source_path, verse_ref, start_ms, end_ms FROM audio_segments
       WHERE layer = 'composite_cast_master' AND speaker_character_id = ? AND verse_ref IS NOT NULL`
    )
    .all(shot.dialogue_character_id) as Array<{ source_path: string; verse_ref: string; start_ms: number; end_ms: number }>;
  const audioSeg = audioRows.find((s) => {
    const { start, end } = parseVerseRange(s.verse_ref);
    return start <= verseEnd && end >= verseStart;
  });
  if (!audioSeg) {
    throw new Error(`No composite_cast_master audio_segments row found for shot ${shotId} (${shot.verse_ref}).`);
  }

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

    const audioAbsPath = join(dataDir, "assets", audioSeg.source_path);
    const relPath = join("generated", "assembled", `${shotId}.mp4`);
    const outPath = join(dataDir, "assets", relPath);
    mkdirSync(join(dataDir, "assets", "generated", "assembled"), { recursive: true });
    muxAudio(silentPath, audioAbsPath, outPath);

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
