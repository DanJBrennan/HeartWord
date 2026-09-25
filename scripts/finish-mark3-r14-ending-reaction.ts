/** Review-only Mark 3 ending bridge, retaining the r13 soundtrack unchanged. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { getDataDir } from "../src/db/client.js";

const root = join(getDataDir(), "assets");
const review = join(root, "generated/video/review");
const input = join(review, "mark3-full-chapter-r13-early-lipsync-review-v1.mp4");
const departure = join(root, "generated/video/kling-932258552361263148.mp4");
const output = join(review, "mark3-full-chapter-r14-ending-reaction-review-v2.mp4");
const manifest = output.replace(/\.mp4$/, ".json");
if (![input, departure].every(existsSync) || existsSync(output) || existsSync(manifest))
  throw new Error("Missing retained input or r14 output already exists; refusing overwrite.");

const fps = 24, totalFrames = 12138, departureStart = 11394;
const reactionFrames = 36, departureFrames = 120;
const grade = "eq=brightness=0.02:contrast=1.05:saturation=1.08," +
  "colorbalance=rs=0.04:gs=0.015:bs=-0.035";
const work = mkdtempSync(join(tmpdir(), "heartword-mark3-r14-"));
const run = (args: string[]): void => {
  execFileSync("ffmpeg", ["-v", "error", "-nostats", "-n", ...args],
    { stdio: "inherit", timeout: 3600000 });
};
try {
  const before = join(work, "before.mp4"), reaction = join(work, "reaction.mp4");
  const wide = join(work, "wide.mp4"), after = join(work, "after.mp4");
  const encode = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-pix_fmt", "yuv420p", "-r", "24"];
  run(["-i", input, "-an", "-vf", "setpts=PTS-STARTPTS,setsar=1",
    "-frames:v", String(departureStart), ...encode, before]);
  // This is a crop of the same retained take used in the subsequent wide
  // view, not a separate room, cast, or generated action. Jesus's partial
  // mantle at right and the seated listener's eyeline keep the geography.
  run(["-i", departure, "-an", "-vf",
    `crop=832:468:0:455,scale=1280:720,${grade},setsar=1`,
    "-frames:v", String(reactionFrames), ...encode, reaction]);
  run(["-ss", String(reactionFrames / fps), "-i", departure, "-an",
    "-vf", `scale=1280:720,${grade},setsar=1`,
    "-frames:v", String(departureFrames - reactionFrames), ...encode, wide]);
  // Frame trim, not time seek: the r13 concat timestamps are fractionally
  // non-integral, and a time seek skipped one tail frame in the first render.
  run(["-i", input, "-an", "-vf",
    `trim=start_frame=${departureStart + departureFrames},setpts=PTS-STARTPTS,setsar=1`,
    "-frames:v", String(totalFrames - departureStart - departureFrames), ...encode, after]);
  const list = join(work, "parts.txt"), picture = join(work, "picture.mp4");
  writeFileSync(list, [before, reaction, wide, after]
    .map(path => `file '${path.replaceAll("\\", "/")}'`).join("\n"));
  run(["-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "copy", picture]);
  run(["-i", picture, "-i", input, "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", output]);
  writeFileSync(manifest, JSON.stringify({ status: "held_for_producer_review",
    input, output, departure, fps, totalFrames,
    edit: { startsAtFrame: departureStart, sourceFrames: [0, departureFrames],
      reactionCropFrames: reactionFrames, crop: "832:468:0:455",
      remainingWideFrames: departureFrames - reactionFrames,
      treatment: "Identical warm grade on the reframe and wide shot; the room and crowd are one continuous retained take." },
    soundtrack: "Bit-for-bit AAC stream copy of r13; no speech, ambience, or music timing changed."
  }, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ output, expectedFrames: totalFrames,
    reactionSeconds: reactionFrames / fps }));
} finally {
  if (!resolve(work).startsWith(resolve(tmpdir()) + sep))
    throw new Error(`Unexpected temporary path ${work}`);
  rmSync(work, { recursive: true, force: true });
}
