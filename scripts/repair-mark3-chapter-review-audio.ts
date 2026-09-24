/** Rebuild the Mark 3 producer cut with one continuous stereo AAC stream. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

type Section = { path: string; start: number; end: number; frames: number };
type Manifest = { sections: Section[]; expectedFrames: number; sourceEndMs: number; note: string };

const root = join(getDataDir(), "assets");
const reviewDir = join(root, "generated/video/review");
const input = join(reviewDir, "mark3-full-chapter-source-review-r1.mp4");
const output = join(reviewDir, "mark3-full-chapter-source-review-r2.mp4");
const oldManifest = JSON.parse(readFileSync(input.replace(/\.mp4$/, ".json"), "utf8")) as Manifest;
const sections = oldManifest.sections;

if (!existsSync(input) || sections.length !== 6 ||
    sections.some((section, i) => !existsSync(join(root, section.path)) ||
      section.end <= section.start || (i > 0 && section.start !== sections[i - 1]!.end)) ||
    sections[0]!.start !== 0 || sections.at(-1)!.end !== oldManifest.sourceEndMs) {
  throw new Error("Mark 3 review sections are missing or discontinuous.");
}

const work = mkdtempSync(join(tmpdir(), "heartword-mark3-audio-repair-"));
const temporaryOutput = join(work, "normalized-review.mp4");
try {
  const inputs = ["-i", input, ...sections.flatMap(section => ["-i", join(root, section.path)])];
  const filters = sections.map((section, i) => {
    const duration = ((section.end - section.start) / 1000).toFixed(3);
    return `[${i + 1}:a:0]aresample=48000,aformat=channel_layouts=stereo,` +
      `apad,atrim=duration=${duration},asetpts=N/SR/TB[a${i}]`;
  });
  filters.push(`${sections.map((_, i) => `[a${i}]`).join("")}concat=n=${sections.length}:v=0:a=1[a]`);
  execFileSync("ffmpeg", ["-v", "error", "-nostats", "-y", ...inputs,
    "-filter_complex", filters.join(";"), "-map", "0:v:0", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart", temporaryOutput],
    { stdio: ["ignore", "ignore", "pipe"], timeout: 1_800_000, maxBuffer: 64 * 1024 * 1024 });

  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries",
    "stream=codec_type,codec_name,sample_rate,channels,nb_frames,duration", "-of", "json", temporaryOutput],
  { encoding: "utf8" })) as { streams: Array<{ codec_type: string; codec_name: string;
    sample_rate?: string; channels?: number; nb_frames?: string; duration?: string }> };
  const video = probe.streams.find(stream => stream.codec_type === "video");
  const audio = probe.streams.find(stream => stream.codec_type === "audio");
  if (Number(video?.nb_frames) !== oldManifest.expectedFrames || audio?.codec_name !== "aac" ||
      audio.channels !== 2 || audio.sample_rate !== "48000" ||
      Math.abs(Number(audio.duration) - oldManifest.sourceEndMs / 1000) > 0.15) {
    throw new Error(`Normalized review QC failed: ${JSON.stringify({ video, audio })}`);
  }

  renameSync(temporaryOutput, output);
  const manifest = { ...oldManifest, audioRepair: {
    source: "mark3-full-chapter-source-review-r1.mp4",
    method: "Decode each reviewed section; pad/trim to its recorded source interval; concatenate as stereo PCM; encode once as AAC.",
    audioCodec: "aac", sampleRate: 48000, channels: 2,
  }, note: "Producer review cut with a single continuous stereo AAC stream. Picture packets are copied from r1; this is not a distribution export." };
  writeFileSync(output.replace(/\.mp4$/, ".json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ output, frames: oldManifest.expectedFrames, audioSeconds: audio.duration }));
} finally {
  rmSync(work, { recursive: true, force: true });
}
