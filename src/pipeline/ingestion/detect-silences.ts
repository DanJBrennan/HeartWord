import { execFileSync, spawnSync } from "node:child_process";

export interface SilenceGap {
  startMs: number;
  endMs: number;
  durationMs: number;
}

/**
 * Total duration of an audio file in milliseconds, via ffprobe (shelled
 * out to, like ffmpeg below — both are preinstalled system tools, no npm
 * dependency needed).
 */
export function getAudioDurationMs(audioPath: string): number {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath],
    { encoding: "utf-8" }
  );
  const seconds = Number(out.trim());
  if (!Number.isFinite(seconds)) {
    throw new Error(`ffprobe returned an unusable duration for ${audioPath}: ${JSON.stringify(out)}`);
  }
  return Math.round(seconds * 1000);
}

/**
 * Runs ffmpeg's silencedetect filter over an audio file and returns every
 * detected silence gap. These are *candidate* pause locations only — see
 * select-boundaries.ts for how a subset of them becomes verse-group
 * boundaries, and docs/ARCHITECTURE.md's ingestion section for why this
 * heuristic (not ASR or forced alignment, neither of which exists for
 * Hatam) is what v1 uses.
 *
 * noiseFloorDb/minDurationSec are tunable per recording; the defaults
 * (-30dB, 0.5s) were chosen by inspecting this specific FCBH recording's
 * actual pause pattern (docs/ARCHITECTURE.md) and may need revisiting for
 * a noisier or differently-mastered recording.
 */
export function detectSilences(
  audioPath: string,
  opts: { noiseFloorDb?: number; minDurationSec?: number } = {}
): SilenceGap[] {
  const noiseFloorDb = opts.noiseFloorDb ?? -30;
  const minDurationSec = opts.minDurationSec ?? 0.5;

  // ffmpeg logs silencedetect's output to stderr and writes decoded audio
  // to a null muxer (we don't need the decoded audio itself). Use
  // spawnSync rather than execFileSync: execFileSync only gives you
  // stderr back when the process *fails*, and this one is expected to
  // exit 0.
  const result = spawnSync(
    "ffmpeg",
    [
      "-i",
      audioPath,
      "-af",
      `silencedetect=noise=${noiseFloorDb}dB:d=${minDurationSec}`,
      "-f",
      "null",
      "-"
    ],
    { encoding: "utf-8" }
  );
  if (result.error) throw result.error;
  const stderr = result.stderr ?? "";
  if (result.status !== 0) {
    throw new Error(`ffmpeg exited with status ${result.status} analyzing ${audioPath}:\n${stderr}`);
  }

  const gaps: SilenceGap[] = [];
  const startRe = /silence_start:\s*([\d.]+)/;
  const endRe = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/;
  let pendingStart: number | undefined;

  for (const line of stderr.split("\n")) {
    const startMatch = line.match(startRe);
    if (startMatch) {
      pendingStart = Number(startMatch[1]);
      continue;
    }
    const endMatch = line.match(endRe);
    if (endMatch && pendingStart !== undefined) {
      gaps.push({
        startMs: Math.round(pendingStart * 1000),
        endMs: Math.round(Number(endMatch[1]) * 1000),
        durationMs: Math.round(Number(endMatch[2]) * 1000)
      });
      pendingStart = undefined;
    }
  }

  return gaps;
}
