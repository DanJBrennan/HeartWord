/**
 * Builds a chapter's opening title-card video clip per
 * docs/design/chapter-title-card.md: book+chapter in the heart language,
 * language name beneath it, over a darkened frame from the chapter's own
 * opening establishing shot. Real font rendering (build-chapter-title-
 * card.py, Pillow) -- never requested from an AI provider, since every
 * generation prompt in this pipeline forbids in-scene text.
 *
 * Usage: npx tsx scripts/build-chapter-title-card.ts <bgFrame.png> <title> <language> <outVideo.mp4> [durationSec]
 * Example: npx tsx scripts/build-chapter-title-card.ts bg.png "MARKUS 2" "HATAM" title-card.mp4 2.5
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PYTHON = "C:\\Python314\\python.exe";
const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 24;

const [bgFrame, title, language, outVideo, durationArg] = process.argv.slice(2);
if (!bgFrame || !title || !language || !outVideo) {
  console.error(
    "Usage: npx tsx scripts/build-chapter-title-card.ts <bgFrame.png> <title> <language> <outVideo.mp4> [durationSec]"
  );
  process.exit(1);
}
const durationSec = durationArg ? parseFloat(durationArg) : 2.5;

mkdirSync(dirname(outVideo), { recursive: true });
const stillPath = outVideo.replace(/\.mp4$/, ".png");

execFileSync(PYTHON, [join(__dirname, "build-chapter-title-card.py"), bgFrame, title, language, stillPath], {
  stdio: "inherit"
});

execFileSync("ffmpeg", [
  "-y",
  "-loop",
  "1",
  "-i",
  stillPath,
  "-t",
  durationSec.toFixed(3),
  "-vf",
  `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=${TARGET_FPS}`,
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-an",
  outVideo
]);

console.log(`Saved: ${outVideo} (${durationSec}s, silent)`);
