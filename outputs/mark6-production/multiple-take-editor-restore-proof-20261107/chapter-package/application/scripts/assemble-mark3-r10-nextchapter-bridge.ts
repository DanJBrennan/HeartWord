/** Reversible Mark 3 -> Mark 4 review ending; original Scripture sound is never shortened. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const root = join(getDataDir(), "assets");
const input = join(root, "generated/video/review/mark3-full-chapter-r9-score-review-v1.mp4");
const output = join(root, "generated/video/review/mark3-full-chapter-r10-nextchapter-bridge-review-v1.mp4");
const names = ["interior-departure", "street-to-sea", "aerial-retreat"] as const;
const clips = [
  "kling-932258552361263148.mp4",
  "kling-932259656267857977.mp4",
  "kling-932261199469740070.mp4"
].map(file => join(root, "generated/video", file));
const cueManifest = join(root, "generated/soundtrack/mark3-r8/chapter-bridge.json");
const cue = JSON.parse(readFileSync(cueManifest, "utf8")) as {
  path: string; durationMs: number; status: string;
  review: { instrumental: boolean; intelligibleSpeech: boolean; audibleArtifact: boolean };
};
if (existsSync(output) || existsSync(output.replace(/\.mp4$/, ".json"))) throw new Error("Review output already exists; refusing overwrite.");
if (![input, ...clips, cue.path].every(existsSync)) throw new Error("A retained source, transition take, or cue is missing.");
if (cue.status !== "screened_candidate" || !cue.review.instrumental || cue.review.intelligibleSpeech || cue.review.audibleArtifact || cue.durationMs < 15000)
  throw new Error("Chapter bridge score is not screened for this review.");

// The old frame 11264 starts a 13-frame flash of the wide Jesus shot. A motion
// take begins on that exact frame; the entire prior 469.900 s sound mix stays.
const cutFrame = 11264, fps = 24, cutSeconds = cutFrame / fps;
const startMs = Math.round(cutSeconds * 1000);
const filter: string[] = [
  `[0:v]trim=end_frame=${cutFrame},setpts=PTS-STARTPTS,fps=${fps},setsar=1[v0]`,
  ...clips.map((_, i) => `[${i + 1}:v]trim=duration=5,setpts=PTS-STARTPTS,scale=1280:720,fps=${fps},setsar=1[v${i + 1}]`),
  `[v0][v1][v2][v3]concat=n=4:v=1:a=0[v]`,
  `[0:a]atrim=end=469.9,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[original]`,
  ...clips.map((_, i) => {
    const delay = startMs + i * 5000;
    return `[${i + 1}:a]atrim=duration=5,asetpts=PTS-STARTPTS,aresample=48000,` +
      `aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.25,afade=t=out:st=4.6:d=0.4,` +
      `volume=-7dB,adelay=${delay}|${delay}[ambient${i}]`;
  }),
  // Starts under the retained final Scripture syllable and swells as the
  // camera rises; finish with a gentle tail rather than an abrupt truncation.
  `[4:a]atrim=duration=15,asetpts=PTS-STARTPTS,aresample=48000,` +
    `aformat=channel_layouts=stereo,volume='0.045+0.15*t/15':eval=frame,` +
    `afade=t=in:st=0:d=0.8,afade=t=out:st=14.15:d=0.85,` +
    `adelay=${startMs}|${startMs}[bridgeScore]`,
  `[original][ambient0][ambient1][ambient2][bridgeScore]amix=inputs=5:duration=longest:normalize=0,alimiter=limit=0.98:level=false[mix]`
];
execFileSync("ffmpeg", ["-v", "error", "-nostats", "-n", "-i", input,
  ...clips.flatMap(path => ["-i", path]), "-i", cue.path,
  "-filter_complex", filter.join(";"), "-map", "[v]", "-map", "[mix]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
  "-r", String(fps), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
  "-t", String(cutSeconds + 15), "-movflags", "+faststart", output],
{ stdio: "inherit", timeout: 3600000 });
writeFileSync(output.replace(/\.mp4$/, ".json"), JSON.stringify({
  status: "held_for_producer_review", input, output, cutFrame, cutSeconds,
  originalAudioEndSeconds: 469.9, transitionClips: names.map((name, i) => ({ name, path: clips[i], startSeconds: cutSeconds + 5 * i, durationSeconds: 5, nativeAmbience: true })),
  nextChapterEvidence: "Mark 4:1 begins beside the sea; wordless departure is producer-directed inferred staging after complete Mark 3 source, not narrated Scripture.",
  cueManifest, cuePath: cue.path, cueStartSeconds: cutSeconds, cueSeconds: 15,
  filter: filter.join(";")
}, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, durationSeconds: cutSeconds + 15, cutFrame }));
