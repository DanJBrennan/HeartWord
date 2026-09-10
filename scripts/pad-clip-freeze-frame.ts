/**
 * Freeze-pads one clip by holding its last frame, using deterministic
 * -frames:v targeting (the same fix used elsewhere in this pipeline for
 * ffmpeg's -t-based trim nondeterminism -- see assemble-single-shot.ts).
 * Used to fix the Blender healing-sequence editor's audio-bed overlap
 * bug (2026-09-10): an independent narration-bed audio strip needs the
 * video underneath it to run exactly as long as the real audio, or the
 * next dialogue-bearing clip starts too early and its own audio
 * overlaps the still-playing narration bed.
 *
 * Usage: npx tsx scripts/pad-clip-freeze-frame.ts <in.mp4> <padMs> <out.mp4>
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TARGET_FPS = 24;

function ffprobeDurationMs(absPath: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", absPath], {
    encoding: "utf-8"
  });
  return Math.round(parseFloat(out.trim()) * 1000);
}

const [inPath, padMsArg, outPath] = process.argv.slice(2);
if (!inPath || !padMsArg || !outPath) {
  console.error("Usage: npx tsx scripts/pad-clip-freeze-frame.ts <in.mp4> <padMs> <out.mp4>");
  process.exit(1);
}
const padMs = parseFloat(padMsArg);
const nativeMs = ffprobeDurationMs(inPath);
const totalMs = nativeMs + padMs;
const targetFrames = Math.round((totalMs / 1000) * TARGET_FPS);

mkdirSync(dirname(outPath), { recursive: true });
execFileSync("ffmpeg", [
  "-y",
  "-i",
  inPath,
  "-vf",
  `tpad=stop_mode=clone:stop_duration=${(padMs / 1000 + 0.5).toFixed(3)}`,
  "-frames:v",
  String(targetFrames),
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "18",
  "-an",
  outPath
]);

console.log(`Saved: ${outPath} (${nativeMs}ms native + ${padMs}ms pad = ${totalMs}ms, ${targetFrames} frames)`);
