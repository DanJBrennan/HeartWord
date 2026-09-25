/** Non-destructive editorial review cut over r6's continuous, source-locked audio. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const db = getDb(), root = join(getDataDir(), "assets");
const base = join(root, "generated/video/review/mark3-full-chapter-source-review-r6-title-card.mp4");
const output = join(root, "generated/video/review/mark3-full-chapter-source-review-r7-editorial-v5.mp4");
if (!existsSync(base) || existsSync(output)) throw new Error("Missing r6 input or r7 output already exists; refusing overwrite.");
const fps = 24, introMs = 26500, originalFrames = 10965;
const frame = (sourceMs: number) => Math.round((sourceMs + introMs) * fps / 1000);
const gapSourceMs = 423272; // Midpoint of 9.203–10.050 s acoustic pause in source-bound 3:34–35 segment.
const gapFrame = frame(gapSourceMs), pauseFrames = 8 * fps;
const frameDir = "generated/keyframes/mark3-r7-editorial";
type Patch = { start: number; end: number; name: string; marker?: string; still?: string; crop?: string; baseCrop?: string };
const patches: Patch[] = [
  { start: 210104, end: 215104, name: "distinct mountain reverse", marker: "mark3-r7-scene3-jesus-reverse-angle-approved-frame-v1" },
  { start: 215104, end: 220104, name: "apostles reaction", marker: "mark3-r7-scene3-apostles-reaction-approved-frame-v1" },
  { start: 245262, end: 250262, name: "living house establishment", marker: "mark3-r7-scene4-crowded-table-approved-frame-v1" },
  { start: 267262, end: 272262, name: "bread and crowd detail", marker: "mark3-r7-scene4-bread-detail-approved-frame-v1" },
  { start: 277262, end: 282262, name: "alternate onlooker angle", marker: "mark3-r7-scene4-onlookers-ots-approved-frame-v1" },
  { start: 282262, end: 287262, name: "side onlooker angle", marker: "mark3-r7-scene4-onlookers-side-approved-frame-v1" },
  { start: 309942, end: 313459, name: "Jesus first-answer closeup", baseCrop: "crop=520:293:680:160,scale=1280:720" },
  { start: 313459, end: 314023, name: "remove scribe flash", still: `${frameDir}/scene4-jesus-singleface-candidate.png` },
  { start: 322023, end: 330023, name: "Jesus closeup first answer", marker: "mark3-r7-jesus-closeup-322023-330023-singleface-v2" },
  { start: 330023, end: 335023, name: "onlookers during Jesus words", marker: "mark3-r7-scene4-onlookers-ots-approved-frame-v1" },
  { start: 344093, end: 352093, name: "Jesus closeup second answer", marker: "mark3-r7-jesus-closeup-344093-352093-singleface-v2" },
  { start: 352093, end: 357079, name: "side listeners during Jesus words", marker: "mark3-r7-scene4-onlookers-side-approved-frame-v1" },
  { start: 371645, end: 376645, name: "seated message with Jesus visible", marker: "mark3-r7-scene5-seated-announcement-approved-frame-v1" },
  { start: 376645, end: 381645, name: "seated Jesus reaction", marker: "mark3-r7-scene5-seated-jesus-reaction-approved-frame-v1" },
  { start: 381645, end: 387645, name: "seated Jesus and doorway reaction", marker: "mark3-r7-scene5-seated-message-lateral-approved-frame-v1", crop: "crop=1000:562:800:220,scale=1280:720" },
  { start: 387645, end: 392645, name: "seated doorway reaction", marker: "mark3-r7-scene5-seated-doorway-reaction-approved-frame-v1" },
  { start: 392645, end: 395645, name: "seated listeners close", still: `${frameDir}/scene5-seated-announcement-candidate.png`, crop: "crop=1100:619:500:200,scale=1280:720" },
  { start: 395645, end: 399191, name: "Jesus listens before spokesperson speaks", marker: "mark3-r7-scene5-seated-spokesperson-anticipation-approved-frame-v1", crop: "crop=1000:562:850:220,scale=1280:720" },
  { start: 399191, end: 406000, name: "spokesperson single-face lip sync", marker: "mark3-r7-scene5-spokesperson-closeup-approved-frame-v1", crop: "crop=800:450:160:60,scale=1280:720" }
];
const pauseMarker = "mark3-r7-scene5-open-arms-pause-approved-frame-v1";
const resolve = (marker: string): string => {
  const row = db.prepare("SELECT result_asset_path,status FROM generation_attempts WHERE prompt LIKE ? AND operation IN ('lip_sync','generate_final_video') ORDER BY created_at DESC LIMIT 1")
    .get(`${marker}%`) as { result_asset_path: string | null; status: string } | undefined;
  if (!row?.result_asset_path || row.status !== "hold_for_review") throw new Error(`Reviewed motion candidate missing: ${marker}`);
  const path = join(root, row.result_asset_path);
  if (!existsSync(path)) throw new Error(`Motion file missing: ${path}`);
  return path;
};
for (const patch of patches) if (patch.marker) resolve(patch.marker);
const pauseClip = resolve(pauseMarker);
for (const patch of patches) if (patch.still && !existsSync(join(root, patch.still))) throw new Error(`Approved still missing: ${patch.still}`);
const intervals = patches.map(patch => ({ ...patch, first: frame(patch.start), last: frame(patch.end) }));
for (const [i, patch] of intervals.entries()) {
  if (patch.first >= patch.last || patch.last > gapFrame || (i && intervals[i - 1]!.last > patch.first))
    throw new Error(`Invalid or overlapping picture patch: ${patch.name}`);
}
const run = (args: string[], timeout = 180000): void => {
  execFileSync("ffmpeg", ["-v", "error", "-nostats", "-y", ...args], { stdio: "inherit", timeout });
};
const work = mkdtempSync(join(tmpdir(), "heartword-mark3-r7-"));
const parts: string[] = [];
const manifest: Array<{ name: string; first: number; last: number; input: string }> = [];
try {
  const add = (name: string, first: number, last: number, input: string, filter?: string, still = false): void => {
    if (last <= first) return;
    const path = join(work, `part-${String(parts.length).padStart(2, "0")}.mp4`), count = last - first;
    const inputArgs = still ? ["-loop", "1", "-framerate", String(fps), "-i", input]
      : input === base ? ["-ss", (first / fps).toFixed(6), "-i", input] : ["-i", input];
    const vf = [filter ?? "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720", "fps=24", "tpad=stop_mode=clone:stop_duration=9", "setsar=1"].join(",");
    run([...inputArgs, "-an", "-vf", vf, "-frames:v", String(count), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", path]);
    parts.push(path); manifest.push({ name, first, last, input });
  };
  let cursor = 0;
  for (const patch of intervals) {
    add("unchanged r6", cursor, patch.first, base);
    const input = patch.marker ? resolve(patch.marker) : patch.still ? join(root, patch.still) : base;
    add(patch.name, patch.first, patch.last, input, patch.crop ?? patch.baseCrop, Boolean(patch.still));
    cursor = patch.last;
  }
  add("unchanged r6 before pause", cursor, gapFrame, base);
  add("eight-second open-arms hold", gapFrame, gapFrame + pauseFrames, pauseClip);
  // Frame numbers in the source continue without any shift inside the base file.
  const post = join(work, "post-gap.mp4"), postFrames = originalFrames - gapFrame;
  run(["-ss", (gapFrame / fps).toFixed(6), "-i", base, "-an", "-vf", "fps=24,scale=1280:720,setsar=1", "-frames:v", String(postFrames),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", post]);
  parts.push(post); manifest.push({ name: "unchanged r6 after pause", first: gapFrame + pauseFrames, last: originalFrames + pauseFrames, input: base });
  const list = join(work, "parts.txt"), silent = join(work, "picture.mp4");
  writeFileSync(list, parts.map(path => `file '${path.replaceAll("\\", "/")}'`).join("\n"));
  run(["-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "copy", silent], 3_600_000);
  const splitSec = (gapFrame / fps).toFixed(6);
  const audioGraph = `[1:a]asplit=2[x][y];[x]atrim=start=0:end=4.5,asetpts=PTS-STARTPTS,aresample=48000[x1];` +
    `[y]atrim=start=0.5:end=5,asetpts=PTS-STARTPTS,aresample=48000[y1];` +
    `[x1][y1]acrossfade=d=0.5,atrim=duration=8,apad,atrim=duration=8,volume=12dB,aformat=channel_layouts=stereo[room];` +
    `[0:a]atrim=start=0:end=${splitSec},asetpts=PTS-STARTPTS,aresample=48000[before];` +
    `[0:a]atrim=start=${splitSec},asetpts=PTS-STARTPTS,aresample=48000[after];` +
    `[before][room][after]concat=n=3:v=0:a=1[a]`;
  mkdirSync(dirname(output), { recursive: true });
  run(["-i", silent, "-i", base, "-i", pauseClip, "-filter_complex",
    `${audioGraph.replaceAll("[1:a]", "[2:a]").replaceAll("[0:a]", "[1:a]")};[0:v]setpts=N/(24*TB)[v]`,
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", output], 3_600_000);
  writeFileSync(output.replace(/\.mp4$/, ".json"), JSON.stringify({ input: base, output, gapSourceMs, gapFrame, pauseFrames, audio: "r6 continuous, with eight-second crossfaded native room ambience from open-arms clip inserted at source pause", picture: manifest }, null, 2));
  console.log(JSON.stringify({ output, frames: originalFrames + pauseFrames, patches: patches.length, gapSourceMs }));
} finally {
  if (!work.startsWith(tmpdir())) throw new Error(`Unexpected temp directory ${work}`);
  rmSync(work, { recursive: true, force: true });
}
