import { execFileSync } from "node:child_process";

/**
 * Cuts [startMs, endMs) out of sourcePath into a standalone mp3 file.
 * Re-encodes rather than stream-copying -- mp3 frame boundaries don't
 * generally line up with arbitrary millisecond cut points, and a
 * standalone re-voiced clip needs a clean, reliable duration far more
 * than it needs to avoid a re-encode.
 */
export function extractClip(sourcePath: string, startMs: number, endMs: number, outPath: string): void {
  const startSec = (startMs / 1000).toFixed(3);
  const durationSec = ((endMs - startMs) / 1000).toFixed(3);
  execFileSync(
    "ffmpeg",
    ["-y", "-i", sourcePath, "-ss", startSec, "-t", durationSec, "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "2", outPath],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
}
