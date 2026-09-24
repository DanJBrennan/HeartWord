/**
 * Build a Mark 3 producer review cut with three independently traceable,
 * eight-second location shots before the source-clock picture and audio.
 *
 * Usage: npx tsx scripts/prepend-mark3-location-intro.ts
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const assets = join(getDataDir(), "assets");
const aerial = "generated/pilot-source/shot-000-ancient-fishing.mp4";
const bridge = "generated/media-library/capernaum-aerial-to-synagogue-zoom-broll-v1.mp4";
const synagogue = "generated/media-library/capernaum-synagogue-arrival-and-town-life-omni-draft-r5-ambient-audible.mp4";
const chapter = "generated/video/review/mark3-full-chapter-source-review-r2.mp4";
const output = "generated/video/review/mark3-full-chapter-source-review-r5-three-shot-intro.mp4";
const intro = "generated/video/review/mark3-location-intro-r3-aerial-zoom-synagogue.mp4";
const path = (relative: string) => join(assets, relative);
for (const relative of [aerial, bridge, synagogue, chapter]) {
  if (!existsSync(path(relative))) throw new Error(`Missing source: ${path(relative)}`);
}
if (existsSync(path(output)) || existsSync(path(intro))) throw new Error("Refusing to overwrite retained review or intro.");

// Each location take supplies its own environmental sound. The source
// soundtrack begins at 24s; each picture uses its own ambient source.
const filter = [
  "[0:v]trim=start=0:end=8,setpts=PTS-STARTPTS,fps=24,scale=1280:720,setsar=1,format=yuv420p[v0]",
  "[1:v]trim=start=0:end=8,setpts=PTS-STARTPTS,fps=24,scale=1280:720,setsar=1,format=yuv420p[v1]",
  "[2:v]trim=start=0:end=8,setpts=PTS-STARTPTS,fps=24,scale=1280:720,setsar=1,format=yuv420p[v2]",
  "[v0][v1][v2]concat=n=3:v=1:a=0[v]",
  "[0:a]atrim=start=0:end=8,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=22dB,afade=t=out:st=7.9:d=0.1[a0]",
  "[1:a]atrim=start=0:end=8,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=3dB,afade=t=in:st=0:d=0.1,afade=t=out:st=7.9:d=0.1[a1]",
  "[2:a]atrim=start=0:end=8,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.1[a2]",
  "[a0][a1][a2]concat=n=3:v=0:a=1[a]",
].join(";");

execFileSync("ffmpeg", [
  "-v", "error", "-nostats", "-i", path(aerial), "-i", path(bridge), "-i", path(synagogue),
  "-filter_complex", filter, "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
  "-movflags", "+faststart", path(intro),
], { stdio: ["ignore", "inherit", "inherit"], timeout: 3_600_000 });

const work = mkdtempSync(join(tmpdir(), "heartword-mark3-intro-"));
try {
  const list = join(work, "video-sections.txt");
  writeFileSync(list, [intro, chapter].map(relative => `file '${path(relative).replaceAll("\\", "/")}'`).join("\n"));
  // Both video sections are 1280x720 H.264 at 24 fps. Copy their picture
  // packets, but decode and encode the entire audio join as one stereo track.
  execFileSync("ffmpeg", [
    "-v", "error", "-nostats", "-f", "concat", "-safe", "0", "-i", list,
    "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart", path(output),
  ], { stdio: ["ignore", "inherit", "inherit"], timeout: 3_600_000 });
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
if (Number(video?.nb_frames) !== 10_905 || video?.width !== 1280 || video?.height !== 720 ||
    audio?.channels !== 2 || Math.abs(Number(audio?.duration) - 454.352) > 0.1) {
  throw new Error(`Unexpected output streams: ${JSON.stringify(probe.streams)}`);
}

async function sha256(relative: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path(relative))) hash.update(chunk);
  return hash.digest("hex");
}
const manifest = {
  purpose: "Producer review; three reusable location shots before the unmodified Mark 3 source-clock edit",
  output,
  intro,
  shots: [
    { asset: aerial, sourceInMs: 0, sourceOutMs: 8000, outputInMs: 0, outputOutMs: 8000, sha256: await sha256(aerial) },
    { asset: bridge, sourceInMs: 0, sourceOutMs: 8000, outputInMs: 8000, outputOutMs: 16000, sha256: await sha256(bridge) },
    { asset: synagogue, sourceInMs: 0, sourceOutMs: 8000, outputInMs: 16000, outputOutMs: 24000, sha256: await sha256(synagogue) },
  ],
  chapter: { asset: chapter, sourceInMs: 0, outputInMs: 24000, sha256: await sha256(chapter) },
  audio: "Aerial source ambience (raised 22 dB) for 0–8 s; the approved zoom bridge's native ambience (raised 3 dB) for 8–16 s; the synagogue's own courtyard ambience for 16–24 s. No added speech. The approved Mark 3 soundtrack starts at output 24 seconds.",
  expectedVideoFrames: 10_905,
  expectedAudioSeconds: 454.352,
};
writeFileSync(path(output.replace(/\.mp4$/, ".json")), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ output: path(output), videoFrames: video.nb_frames, audioSeconds: audio.duration }, null, 2));
