/**
 * Builds one continuous "narration audio block": concatenates a group of
 * silent covering clips (existing shots + supplementary inserts) for one
 * real narration-only span, pads any shortfall by freezing the last
 * frame, and muxes the real narration audio underneath the whole group
 * as a single continuous track -- reviving the mechanism built (then
 * reverted) for the exit sequence, now applied to a genuine
 * narration gap rather than a music-bed exception (Dan's review,
 * 2026-09-10: "No ambient sound anywhere" / narration silent under the
 * new gap-filler shots was a real, confirmed bug -- see chat).
 *
 * Usage: npx tsx scripts/build-narration-audio-block.ts <output-name> <narrationVerseRef>
 *   <clip1RelPath>:<durationMsOrShotId> <clip2...> ...
 * Simpler: hardcode the segment list per call site below and just pass
 * the output name + narration verse_ref.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 24;
const AUDIO_SAMPLE_RATE = 44100;

function ffprobeFrameCount(absPath: string): number {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v", "-count_frames", "-show_entries", "stream=nb_read_frames", "-of", "default=noprint_wrappers=1:nokey=1", absPath],
    { encoding: "utf-8" }
  );
  return parseInt(out.trim().split("\n")[0], 10);
}

function normalizeSilent(sourcePath: string, durationMs: number, outPath: string): void {
  const targetFrames = Math.round((durationMs / 1000) * TARGET_FPS);
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
      outPath
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
}

function concatClips(clipPaths: string[], outPath: string, tmpDir: string): void {
  const listPath = join(tmpDir, "concat-list.txt");
  writeFileSync(listPath, clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath], { stdio: ["ignore", "ignore", "pipe"] });
}

export interface AudioBlockSegment {
  sourceAbsPath: string;
  durationMs: number;
  label: string;
}

export function buildNarrationAudioBlock(
  segments: AudioBlockSegment[],
  narrationAudio: { sourceAbsPath: string; startMs: number; endMs: number },
  outAbsPath: string
): { totalVideoMs: number; realAudioMs: number; paddedMs: number } {
  const realAudioMs = narrationAudio.endMs - narrationAudio.startMs;
  const rawTotalMs = segments.reduce((s, seg) => s + seg.durationMs, 0);
  const deficitMs = realAudioMs - rawTotalMs;

  const tmpDir = mkdtempSync(join(tmpdir(), "heartword-narration-block-"));
  try {
    const normalizedPaths: string[] = [];
    segments.forEach((seg, i) => {
      const p = join(tmpDir, `${i.toString().padStart(2, "0")}-${seg.label.replace(/[^a-zA-Z0-9-]/g, "_")}.mp4`);
      normalizeSilent(seg.sourceAbsPath, seg.durationMs, p);
      normalizedPaths.push(p);
    });

    const concatPath = join(tmpDir, "concat.mp4");
    concatClips(normalizedPaths, concatPath, tmpDir);

    let finalVideoPath = concatPath;
    let totalVideoMs = rawTotalMs;
    if (deficitMs > 0) {
      const paddedPath = join(tmpDir, "padded.mp4");
      const actualFrames = ffprobeFrameCount(concatPath);
      const targetFrames = Math.round((realAudioMs / 1000) * TARGET_FPS);
      const padFrames = targetFrames - actualFrames;
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-i",
          concatPath,
          "-vf",
          `tpad=stop_mode=clone:stop_duration=${(deficitMs / 1000 + 0.5).toFixed(3)}`,
          "-frames:v",
          String(targetFrames),
          "-c:v",
          "libx264",
          "-preset",
          "medium",
          "-crf",
          "18",
          paddedPath
        ],
        { stdio: ["ignore", "ignore", "pipe"] }
      );
      finalVideoPath = paddedPath;
      totalVideoMs = realAudioMs;
      console.log(`  Padded ${deficitMs}ms shortfall via freeze-frame (${padFrames} frames) to match real narration length.`);
    }

    mkdirSync(join(outAbsPath, ".."), { recursive: true });
    const targetFrames = Math.round((totalVideoMs / 1000) * TARGET_FPS);
    // When the real video (all real content, no invented padding) already
    // runs LONGER than the real narration audio, do NOT let -shortest
    // silently truncate the tail of the last clip to match the shorter
    // audio -- that throws away real generated content. Instead pad the
    // audio with trailing silence so the video plays out in full; a brief
    // silent tail before the next dialogue-bearing shot is normal pacing,
    // not a defect (found 2026-09-10 after adding enough real coverage
    // that this span no longer needed freeze-frame padding at all).
    const audioPadSec = Math.max(0, (totalVideoMs - realAudioMs) / 1000);
    const audioFilter =
      audioPadSec > 0 ? `apad=pad_dur=${audioPadSec.toFixed(3)}` : "anull";
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        finalVideoPath,
        "-ss",
        (narrationAudio.startMs / 1000).toFixed(3),
        "-i",
        narrationAudio.sourceAbsPath,
        "-t",
        (totalVideoMs / 1000).toFixed(3),
        "-frames:v",
        String(targetFrames),
        "-af",
        audioFilter,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-ar",
        String(AUDIO_SAMPLE_RATE),
        "-ac",
        "2",
        "-c:a",
        "aac",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        outAbsPath
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );

    return { totalVideoMs, realAudioMs, paddedMs: Math.max(0, deficitMs) };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function run() {
  const db = getDb();
  const dataDir = getDataDir();

  const narrationRow = db
    .prepare(`SELECT source_path, start_ms, end_ms FROM audio_segments WHERE verse_ref = 'Mark 2:5-8 (narration)'`)
    .get() as { source_path: string; start_ms: number; end_ms: number };

  // friends-watching-from-roof-aperture REMOVED from this group (2026-09-10,
  // Dan): repositioned to the digging beat -- "the moment the hole finally
  // opens" -- so it now lives in the Mark 2:1-5 narration block instead
  // (see build-mark-2-1-5-narration-block.ts).
  //
  // Both remaining clips reshot (2026-09-10, Dan): crowd-witness-
  // breathless-reaction had an arched/gable roof (even in its own
  // keyframe) contradicting the flat roof established elsewhere; the
  // DB-tracked scribe shot (fe9886dc) was a wide group shot with no
  // clear focal point under real narration -- replaced with a tight
  // close-up on the Principal Scribe, mouth closed/still.
  const segments: AudioBlockSegment[] = [
    { sourceAbsPath: join(dataDir, "assets", "generated/video/crowd-witness-breathless-reaction-flatroof.mp4"), durationMs: 4000, label: "crowd-witness-breathless-reaction" },
    { sourceAbsPath: join(dataDir, "assets", "generated/video/scribe-questions-in-heart-closeup.mp4"), durationMs: 4000, label: "scribe-questions-in-heart-closeup" }
  ];

  const outRelPath = "generated/chapter/blocks/mark-2-5-8-narration-block.mp4";
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
