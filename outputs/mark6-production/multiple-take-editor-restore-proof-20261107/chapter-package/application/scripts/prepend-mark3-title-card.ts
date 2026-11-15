/**
 * Add the established Hatam chapter card ahead of the approved Mark 3 intro.
 * The existing three shots and source-clock chapter remain unchanged.
 *
 * Usage: npx tsx scripts/prepend-mark3-title-card.ts
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDataDir } from "../src/db/client.js";

const scripts = dirname(fileURLToPath(import.meta.url));
const assets = join(getDataDir(), "assets");
const aerial = "generated/pilot-source/shot-000-ancient-fishing.mp4";
const input = "generated/video/review/mark3-full-chapter-source-review-r5-three-shot-intro.mp4";
const background = "generated/chapter/blocks/mark-3-title-background.png";
const silentCard = "generated/chapter/blocks/mark-3-title-card.mp4";
const ambientCard = "generated/chapter/blocks/mark-3-title-card-ambient.mp4";
const output = "generated/video/review/mark3-full-chapter-source-review-r6-title-card.mp4";
const path = (relative: string) => join(assets, relative);
for (const relative of [aerial, input]) {
  if (!existsSync(path(relative))) throw new Error(`Missing source: ${path(relative)}`);
}
for (const relative of [silentCard, ambientCard, output]) {
  if (existsSync(path(relative))) throw new Error(`Refusing to overwrite retained asset: ${path(relative)}`);
  mkdirSync(dirname(path(relative)), { recursive: true });
}

if (!existsSync(path(background))) execFileSync("ffmpeg", [
  "-v", "error", "-nostats", "-i", path(aerial), "-frames:v", "1", path(background),
], { stdio: "inherit" });
execFileSync(process.execPath, [
  join(scripts, "..", "node_modules", "tsx", "dist", "cli.mjs"),
  join(scripts, "build-chapter-title-card.ts"),
  path(background), "MARKUS 3", "HATAM", path(silentCard), "2.5",
], { stdio: "inherit", timeout: 120_000 });

// Match the audible aerial bed used in the next shot. The card contains no
// narration; the unchanged source-clock soundtrack begins after the intro.
execFileSync("ffmpeg", [
  "-v", "error", "-nostats", "-i", path(silentCard), "-i", path(aerial),
  "-filter_complex", "[1:a]atrim=start=0:end=2.5,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=22dB[a]",
  "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac",
  "-b:a", "192k", "-ar", "48000", "-ac", "2", "-t", "2.5",
  "-movflags", "+faststart", path(ambientCard),
], { stdio: "inherit", timeout: 120_000 });

const work = mkdtempSync(join(tmpdir(), "heartword-mark3-card-"));
try {
  const list = join(work, "sections.txt");
  writeFileSync(list, [ambientCard, input].map(relative => `file '${path(relative).replaceAll("\\", "/")}'`).join("\n"));
  execFileSync("ffmpeg", [
    "-v", "error", "-nostats", "-f", "concat", "-safe", "0", "-i", list,
    "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-c:a", "aac",
    "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart", path(output),
  ], { stdio: "inherit", timeout: 3_600_000 });
} finally {
  rmSync(work, { recursive: true, force: true });
}

const probe = JSON.parse(execFileSync("ffprobe", [
  "-v", "error", "-show_entries", "format=duration:stream=codec_type,nb_frames,duration,channels,width,height",
  "-of", "json", path(output),
], { encoding: "utf8" })) as {
  streams: Array<{ codec_type: string; nb_frames?: string; duration?: string; channels?: number; width?: number; height?: number }>;
};
const video = probe.streams.find(s => s.codec_type === "video");
const audio = probe.streams.find(s => s.codec_type === "audio");
if (Number(video?.nb_frames) !== 10_965 || video?.width !== 1280 || video?.height !== 720 ||
    audio?.channels !== 2 || Math.abs(Number(audio?.duration) - 456.879) > 0.1) {
  throw new Error(`Unexpected output streams: ${JSON.stringify(probe.streams)}`);
}

async function sha256(relative: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path(relative))) hash.update(chunk);
  return hash.digest("hex");
}
const manifest = {
  purpose: "Mark 3 Hatam opening title card using the established Mark 2 treatment",
  output,
  title: "MARKUS 3",
  language: "HATAM",
  durationMs: 2500,
  background: { asset: aerial, frame: 0, extractedStill: background, sha256: await sha256(aerial) },
  card: { still: silentCard.replace(/\.mp4$/, ".png"), video: ambientCard, audio: "Aerial ambience, raised 22 dB; no narration" },
  existingCut: { asset: input, outputInMs: 2500, sha256: await sha256(input) },
  chapterSourceClockOutputInMs: 26500,
  expectedVideoFrames: 10_965,
  expectedAudioSeconds: 456.879,
};
writeFileSync(path(output.replace(/\.mp4$/, ".json")), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ output: path(output), videoFrames: video.nb_frames, audioSeconds: audio.duration }, null, 2));
