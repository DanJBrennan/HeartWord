/** Pin the generated bridge's terminal pictures to the actual adjacent shots. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const assets = join(getDataDir(), "assets");
const candidate = "generated/video/review/mark3-capernaum-aerial-to-synagogue-bridge-v2.mp4";
const start = "generated/keyframes/mark3-location-bridge-aerial-frame191.png";
const end = "generated/keyframes/mark3-location-bridge-synagogue-frame0.png";
const output = "generated/video/review/mark3-capernaum-aerial-to-synagogue-bridge-v2-endpoint-locked.mp4";
const path = (relative: string) => join(assets, relative);
for (const relative of [candidate, start, end]) if (!existsSync(path(relative))) throw new Error(`Missing ${path(relative)}`);
if (existsSync(path(output))) throw new Error(`Refusing to overwrite ${path(output)}`);

// Only the terminal few frames are blended to the exact adjoining picture.
// The center of the eight-second generated camera move is untouched.
const filter = [
  "[1:v]format=yuva420p,fade=t=out:st=0:d=0.166667:alpha=1[first]",
  "[0:v][first]overlay=shortest=1:format=auto[opening]",
  "[2:v]format=yuva420p,fade=t=in:st=7.666667:d=0.291666:alpha=1[last]",
  "[opening][last]overlay=shortest=1:format=auto,format=yuv420p[v]",
].join(";");
execFileSync("ffmpeg", ["-v", "error", "-nostats", "-i", path(candidate),
  "-loop", "1", "-framerate", "24", "-i", path(start),
  "-loop", "1", "-framerate", "24", "-i", path(end),
  "-filter_complex", filter, "-map", "[v]", "-map", "0:a:0", "-frames:v", "192",
  "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy",
  "-movflags", "+faststart", path(output)],
  { stdio: ["ignore", "inherit", "inherit"], timeout: 180_000 });

const streams = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,nb_frames,channels,width,height", "-of", "json", path(output)], { encoding: "utf8" })) as {
  streams: Array<{ codec_type: string; nb_frames?: string; channels?: number; width?: number; height?: number }>;
};
const video = streams.streams.find(s => s.codec_type === "video");
const audio = streams.streams.find(s => s.codec_type === "audio");
if (Number(video?.nb_frames) !== 192 || video?.width !== 1280 || video?.height !== 720 || audio?.channels !== 2)
  throw new Error(`Unexpected output streams: ${JSON.stringify(streams.streams)}`);

const hash = (relative: string) => createHash("sha256").update(readFileSync(path(relative))).digest("hex");
writeFileSync(path(output.replace(/\.mp4$/, ".json")), JSON.stringify({
  status: "hold_for_producer_review",
  selectedOnTimeline: false,
  output,
  generatedCandidate: { asset: candidate, sha256: hash(candidate) },
  firstFrame: { asset: start, sha256: hash(start) },
  lastFrame: { asset: end, sha256: hash(end) },
  terminalBlend: "first 0.167 s and final 0.292 s only; generated center and ambient track retained",
  intendedPlacementAfterApproval: "Intro shot 2, output 8–16 s; synagogue shot would move to 16–24 s and Mark 3 source clock would start at 24 s.",
}, null, 2));
console.log(JSON.stringify({ output: path(output), videoFrames: video.nb_frames, audioChannels: audio.channels }, null, 2));
