/** Remove the eight-frame premature scribes-departure flash from Mark 3. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { getDataDir } from "../src/db/client.js";

const review = join(getDataDir(), "assets/generated/video/review");
const input = join(review, "mark3-full-chapter-r14-ending-reaction-review-v2.mp4");
const output = join(review, "mark3-full-chapter-r15-no-premature-departure-review-v1.mp4");
const manifest = output.replace(/\.mp4$/, ".json");
if (!existsSync(input) || existsSync(output) || existsSync(manifest))
  throw new Error("Missing r14 input or r15 output exists; refusing overwrite.");

const totalFrames = 12138, handStart = 2401, flashStart = 2409, flashEnd = 2417;
const work = mkdtempSync(join(tmpdir(), "heartword-mark3-r15-"));
const run = (args: string[]): void => {
  execFileSync("ffmpeg", ["-v", "error", "-nostats", "-n", ...args],
    { stdio: "inherit", timeout: 3600000 });
};
try {
  const prefix = join(work, "prefix.mp4"), hand = join(work, "hand.mp4");
  const tail = join(work, "tail.mp4"), picture = join(work, "picture.mp4");
  const encode = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-pix_fmt", "yuv420p", "-r", "24"];
  run(["-i", input, "-an", "-vf", "setpts=PTS-STARTPTS,setsar=1",
    "-frames:v", String(handStart), ...encode, prefix]);
  // The preceding eight source frames show the continuous healed-hand detail.
  // Slowing just these frames to sixteen covers the early departure without
  // freezing the hand, altering total duration, or repeating later action.
  run(["-i", input, "-an", "-vf",
    `trim=start_frame=${handStart}:end_frame=${flashStart},setpts=2*(PTS-STARTPTS),fps=24,setsar=1`,
    "-frames:v", String(flashEnd - handStart), ...encode, hand]);
  run(["-i", input, "-an", "-vf",
    `trim=start_frame=${flashEnd},setpts=PTS-STARTPTS,setsar=1`,
    "-frames:v", String(totalFrames - flashEnd), ...encode, tail]);
  const list = join(work, "parts.txt");
  writeFileSync(list, [prefix, hand, tail]
    .map(path => `file '${path.replaceAll("\\", "/")}'`).join("\n"));
  run(["-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "copy", picture]);
  run(["-i", picture, "-i", input, "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", output]);
  writeFileSync(manifest, JSON.stringify({ status: "held_for_producer_review",
    input, output, fps: 24, totalFrames,
    earlyDepartureFramesRemoved: [flashStart, flashEnd],
    handDetailStretchedFrames: [handStart, flashStart],
    replacementFrames: [handStart, flashEnd],
    laterSeatedAndDepartureShotsUntouched: true,
    soundtrack: "Bit-for-bit AAC stream copy of r14; no timing or content change."
  }, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ output, expectedFrames: totalFrames,
    removedFlashSeconds: (flashEnd - flashStart) / 24 }));
} finally {
  if (!resolve(work).startsWith(resolve(tmpdir()) + sep))
    throw new Error(`Unexpected temporary path ${work}`);
  rmSync(work, { recursive: true, force: true });
}
