/** Review-only picture correction for five producer-identified early lip-sync spans. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { getDataDir } from "../src/db/client.js";

const dir = join(getDataDir(), "assets/generated/video/review");
const input = join(dir, "mark3-full-chapter-r12-single-entry-ambience-review-v1.mp4");
const output = join(dir, "mark3-full-chapter-r13-early-lipsync-review-v1.mp4");
const manifestPath = output.replace(/\.mp4$/, ".json");
if (!existsSync(input) || existsSync(output) || existsSync(manifestPath))
  throw new Error("Missing r12 input or r13 review output already exists; refusing overwrite.");

// These are picture boundaries in r12, after the 110-frame entrance removal.
// Only a speaking face is delayed. The source/cast soundtrack is stream-copied.
const spans = [
  { name: "Jesus calls the man", start: 1284, end: 1432 },
  { name: "Jesus asks the Sabbath question, first close-up", start: 1528, end: 1690 },
  { name: "Jesus asks the Sabbath question, final close-up", start: 1769, end: 1864 },
  { name: "Unclean spirit speaks", start: 4776, end: 4841 },
  { name: "Jesus appoints the disciples", start: 5355, end: 5546 }
];
const fps = 24, delay = 6, lead = 12, totalFrames = 12138;
for (const [i, span] of spans.entries()) {
  if (span.start < lead || span.end - span.start <= delay || span.end > totalFrames ||
      (i > 0 && span.start - lead < spans[i - 1]!.end))
    throw new Error(`Invalid or overlapping picture span: ${span.name}`);
}
const run = (args: string[], timeout = 3600000): void => {
  execFileSync("ffmpeg", ["-v", "error", "-nostats", "-n", ...args], { stdio: "inherit", timeout });
};
const work = mkdtempSync(join(tmpdir(), "heartword-mark3-r13-"));
const parts: string[] = [];
try {
  const add = (name: string, first: number, count: number, stretch = false): void => {
    if (count <= 0) return;
    const file = join(work, `part-${String(parts.length).padStart(2, "0")}.mp4`);
    // The 12-frame mouth-hidden lead becomes 18 frames. Its mild temporal
    // stretch avoids a six-frame freeze; the speaking shot then starts six
    // frames later and ends on its existing boundary without altering audio.
    const vf = stretch ? "setpts=1.5*(PTS-STARTPTS),fps=24,setsar=1" : "setpts=PTS-STARTPTS,setsar=1";
    run(["-ss", (first / fps).toFixed(9), "-i", input, "-an", "-vf", vf,
      "-frames:v", String(count), "-c:v", "libx264", "-preset", "veryfast",
      "-crf", "18", "-pix_fmt", "yuv420p", "-r", "24", file]);
    parts.push(file);
    console.log(`${name}: ${count} frames`);
  };
  let cursor = 0;
  for (const span of spans) {
    add(`unchanged to ${span.name}`, cursor, span.start - lead - cursor);
    add(`mouth-hidden lead for ${span.name}`, span.start - lead, lead + delay, true);
    add(`delayed picture for ${span.name}`, span.start, span.end - span.start - delay);
    cursor = span.end;
  }
  add("unchanged tail", cursor, totalFrames - cursor);
  const list = join(work, "parts.txt"), picture = join(work, "picture.mp4");
  writeFileSync(list, parts.map(path => `file '${path.replaceAll("\\", "/")}'`).join("\n"));
  run(["-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "copy", picture]);
  run(["-i", picture, "-i", input, "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", output]);
  writeFileSync(manifestPath, JSON.stringify({ status: "held_for_producer_review", input, output,
    frames: totalFrames, fps, pictureDelayFrames: delay, spans,
    method: "Stretch 12 preceding mouth-hidden frames to 18, then retain each speaking shot from its first frame through six frames before its old end.",
    soundtrack: "AAC stream-copied without any offset, replacement, or re-encoding from r12."
  }, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ output, expectedFrames: totalFrames, spans: spans.length }));
} finally {
  if (!resolve(work).startsWith(resolve(tmpdir()) + sep)) throw new Error(`Unexpected temp path ${work}`);
  rmSync(work, { recursive: true, force: true });
}
