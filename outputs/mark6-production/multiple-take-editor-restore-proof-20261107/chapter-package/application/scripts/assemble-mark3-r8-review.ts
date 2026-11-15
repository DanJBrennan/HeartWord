/** Non-destructive Mark 3 editorial/emotion review over the retained v5 cut. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const db = getDb(), root = join(getDataDir(), "assets"), fps = 24;
const base = join(root, "generated/video/review/mark3-full-chapter-source-review-r7-editorial-v5.mp4");
const output = join(root, "generated/video/review/mark3-full-chapter-source-review-r8-emotion-editorial-v2.mp4");
if (!existsSync(base) || existsSync(output)) throw new Error("Missing v5 input or r8 output already exists; refusing overwrite.");
const introMs = 26500, oldPauseFrames = 192, oldPauseSourceMs = 423272, baseFrames = 11157;
const srcFrame = (ms: number): number => Math.round((ms + introMs) * fps / 1000) + (ms > oldPauseSourceMs ? oldPauseFrames : 0);
const marker = (name: string): string => {
  const row = db.prepare("SELECT result_asset_path,status FROM generation_attempts WHERE prompt LIKE ? AND operation IN ('lip_sync','generate_final_video') ORDER BY created_at DESC LIMIT 1")
    .get(`${name}%`) as { result_asset_path: string | null; status: string } | undefined;
  if (!row?.result_asset_path || row.status !== "hold_for_review") throw new Error(`Retained candidate missing: ${name}`);
  const path = join(root, row.result_asset_path);
  if (!existsSync(path)) throw new Error(`Media missing: ${path}`);
  return path;
};
type Patch = { name: string; first: number; last: number; input: string; still?: boolean; crop?: string };
const clip = (name: string) => marker(`mark3-implied-emotion-${name}-v1`);
const r7 = (name: string) => marker(`mark3-r7-${name}-approved-frame-v1`);
const close = (start: number, end: number) => marker(`mark3-final-jesus-closeup-${start}-${end}-v1`);
const patch = (name: string, start: number, end: number, input: string, crop?: string): Patch =>
  ({ name, first: srcFrame(start), last: srcFrame(end), input, crop });
const patches: Patch[] = [
  patch("synagogue listening instead of second entrance", 12616, 18616, clip("synagogue-listeners")),
  patch("shoreline relief instead of frozen hold", 168417, 171958, clip("shoreline-relief")),
  patch("crowd reacts as opponents depart", 84500, 89500, clip("departure-witnesses")),
  patch("crowded house Jesus alternate", 250262, 255262, clip("house-jesus-crowded")),
  patch("crowded house listeners reverse", 255262, 260262, clip("house-listeners-reverse")),
  patch("unreachable bread detail", 260262, 267262, r7("scene4-bread-detail")),
  patch("crowded room orientation", 267262, 272262, r7("scene4-crowded-table")),
  patch("interior listeners instead of exterior teleport", 272262, 277262, r7("scene4-onlookers-ots")),
  patch("second interior listener angle", 277262, 282262, r7("scene4-onlookers-side")),
  patch("room reverse before discussion", 282262, 287262, clip("house-listeners-reverse")),
  patch("Jesus and crowd during narration", 295262, 301262, clip("house-jesus-crowded")),
  patch("listeners during narration", 301262, 307942, r7("scene4-onlookers-ots")),
  { ...patch("remove bright Jesus flash", 313459, 314023,
    join(root, "generated/keyframes/mark3-r7-editorial/flash-before.png")), still: true },
  patch("continuous listeners, no scribe re-entry", 330023, 336093, r7("scene4-onlookers-ots")),
  patch("no scribe during Jesus words", 364645, 371645, r7("scene4-onlookers-side")),
  patch("waiting family reaction", 387645, 392645, clip("family-doorway-reaction")),
  patch("moving seated reaction instead of three-second still", 392645, 395645, r7("scene5-seated-message-lateral"), "crop=1000:562:650:220,scale=1280:720"),
  patch("Jesus final line before pause", 419245, 423272, close(419245, 423272)),
  { name: "Jesus opens arms over the wordless beat", first: srcFrame(423272), last: srcFrame(423272) + 120, input: clip("open-arms-gesture") },
  { name: "moving continuation of the wordless beat", first: srcFrame(423272) + 120, last: srcFrame(423272) + 192, input: clip("open-arms-continuation") },
  patch("Jesus final line after pause", 423272 + 1, 427645, close(423272, 427645)),
  patch("Jesus final words close", 427645, 429852, close(427645, 429852))
].sort((a, b) => a.first - b.first);
// The first after-pause frame has its own offset; do not steal a pause frame.
patches.find(p => p.name === "Jesus final line after pause")!.first = srcFrame(423272) + oldPauseFrames;
const healFrame = srcFrame(78779), healFrames = 120;
for (const [i, p] of patches.entries()) {
  if (p.last <= p.first || p.last > baseFrames || (i && p.first < patches[i - 1]!.last)) throw new Error(`Invalid or overlapping patch: ${p.name}`);
  if (!existsSync(p.input)) throw new Error(`Missing patch input: ${p.name}`);
}
const run = (args: string[], timeout = 180000) => execFileSync("ffmpeg", ["-v", "error", "-nostats", "-y", ...args], { stdio: "inherit", timeout });
const duration = (path: string): number => {
  const value = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration", "-of", "default=nw=1:nk=1", path], { encoding: "utf8" });
  return Number(value.trim());
};
const work = mkdtempSync(join(tmpdir(), "heartword-mark3-r8-"));
const parts: string[] = [], manifest: Array<{ name: string; baseFirst: number; baseLast: number; input: string }> = [];
try {
  const add = (name: string, first: number, last: number, input: string, crop?: string, still = false): void => {
    if (last <= first) return;
    const count = last - first, path = join(work, `part-${String(parts.length).padStart(2, "0")}.mp4`);
    const inputArgs = still ? ["-loop", "1", "-framerate", "24", "-i", input]
      : input === base ? ["-ss", (first / fps).toFixed(6), "-i", input] : ["-i", input];
    const target = count / fps, ratio = !still && input !== base ? target / duration(input) : 1;
    const vf = [input !== base && !still ? `setpts=${ratio.toFixed(8)}*(PTS-STARTPTS)` : "setpts=PTS-STARTPTS",
      crop ?? "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720", "fps=24",
      "tpad=stop_mode=clone:stop_duration=1", "setsar=1"].join(",");
    run([...inputArgs, "-an", "-vf", vf, "-frames:v", String(count), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", path], 600000);
    parts.push(path); manifest.push({ name, baseFirst: first, baseLast: last, input });
  };
  let cursor = 0, healed = false;
  for (const p of patches) {
    if (!healed && p.first > healFrame) {
      add("unchanged v5 before healed-man beat", cursor, healFrame, base);
      add("five-second restored-hand reaction", 0, healFrames, clip("healed-man-astonishment"));
      healed = true; cursor = healFrame;
    }
    add("unchanged v5", cursor, p.first, base);
    add(p.name, p.first, p.last, p.input, p.crop, p.still);
    cursor = p.last;
  }
  if (!healed) throw new Error("Healed-man beat was not inserted.");
  add("unchanged v5 to chapter end", cursor, baseFrames, base);
  const list = join(work, "parts.txt"), picture = join(work, "picture.mp4");
  writeFileSync(list, parts.map(path => `file '${path.replaceAll("\\", "/")}'`).join("\n"));
  run(["-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "copy", picture], 3600000);
  const healTime = (healFrame / fps).toFixed(6), crowdTimeMs = Math.round((srcFrame(84500) / fps + 5) * 1000);
  const graph = `[1:a]asplit=2[ai][ar];[ai]atrim=end=18,asetpts=PTS-STARTPTS,afade=t=out:st=15.5:d=2.5[fade];` +
    `[ar]atrim=start=18,asetpts=PTS-STARTPTS[rest];[fade][rest]concat=n=2:v=0:a=1[baseaudio];` +
    `[baseaudio]asplit=2[hpre][hpost];[hpre]atrim=end=${healTime},asetpts=PTS-STARTPTS[before];` +
    `[hpost]atrim=start=${healTime},asetpts=PTS-STARTPTS[after];` +
    `[2:a]atrim=duration=5,asetpts=PTS-STARTPTS,aresample=48000,volume=12dB,aformat=channel_layouts=stereo[heal];` +
    `[before][heal][after]concat=n=3:v=0:a=1[continuous];` +
    `[3:a]atrim=duration=5,asetpts=PTS-STARTPTS,aresample=48000,volume=-18dB,adelay=${crowdTimeMs}|${crowdTimeMs},aformat=channel_layouts=stereo[crowd];` +
    `[continuous][crowd]amix=inputs=2:duration=first:dropout_transition=0,aresample=48000[a];[0:v]setpts=N/(24*TB)[v]`;
  run(["-i", picture, "-i", base, "-i", clip("healed-man-astonishment"), "-i", clip("departure-witnesses"),
    "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", output], 3600000);
  writeFileSync(output.replace(/\.mp4$/, ".json"), JSON.stringify({ input: base, output, baseFrames, healFrame, healFrames,
    sourceAudio: "Retained v5 source/cast performance in original order and duration; five-second nonverbal beat added after Mark 3:5; intro music fades 15.5–18 s; native crowd cue mixed -18 dB under narration.",
    picture: manifest }, null, 2));
  console.log(JSON.stringify({ output, expectedFrames: baseFrames + healFrames, patches: patches.length }));
} finally {
  if (!resolve(work).startsWith(resolve(tmpdir()) + sep)) throw new Error(`Unexpected temporary work path ${work}`);
  rmSync(work, { recursive: true, force: true });
}
