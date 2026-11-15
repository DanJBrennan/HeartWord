/** Reversible score-only review mix over the retained Mark 3 r8 picture. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const root = join(getDataDir(), "assets");
const input = join(root, "generated/video/review/mark3-full-chapter-source-review-r8-emotion-editorial-v2.mp4");
const output = join(root, "generated/video/review/mark3-full-chapter-r9-score-review-v1.mp4");
if (!existsSync(input) || existsSync(output)) throw new Error("The r8 source is missing or the score review already exists; refusing overwrite.");

const selections = [
  { name: "synagogue-v2", startMs: 69000, endMs: 128000, gainDb: -21 },
  { name: "calling", startMs: 204000, endMs: 266000, gainDb: -20 },
  { name: "house-v2", startMs: 286000, endMs: 379000, gainDb: -21 },
  { name: "family", startMs: 404000, endMs: 469875, gainDb: -22 }
] as const;
const cues = selections.map(cue => {
  const manifestPath = join(root, "generated", "soundtrack", "mark3-r8", `${cue.name}.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    path: string; durationMs: number; status: string; review: { instrumental: boolean; intelligibleSpeech: boolean; audibleArtifact: boolean };
  };
  if (manifest.status !== "screened_candidate" || !manifest.review.instrumental || manifest.review.intelligibleSpeech || manifest.review.audibleArtifact)
    throw new Error(`Score cue is not screened for use: ${cue.name}`);
  if (!existsSync(manifest.path) || manifest.durationMs < cue.endMs - cue.startMs) throw new Error(`Missing or short cue: ${cue.name}`);
  return { ...cue, path: manifest.path, sourceManifest: manifestPath };
});

const filter: string[] = [];
for (const [i, cue] of cues.entries()) {
  const length = (cue.endMs - cue.startMs) / 1000;
  const source = i === 3 ? "[family-main]" : `[${i + 1}:a]`;
  if (i === 3) filter.push("[4:a]asplit=2[family-main][family-lift]");
  filter.push(`${source}atrim=duration=${length},asetpts=PTS-STARTPTS,aresample=48000,` +
    `aformat=channel_layouts=stereo,afade=t=in:st=0:d=2,afade=t=out:st=${length - 3}:d=3,` +
    `volume=${cue.gainDb}dB,adelay=${cue.startMs}|${cue.startMs}[cue${i}]`);
}
// A separately adjustable lift over the already-approved eight-second wordless gesture.
filter.push("[family-lift]atrim=start=50.792:duration=8,asetpts=PTS-STARTPTS,aresample=48000," +
  "aformat=channel_layouts=stereo,afade=t=in:st=0:d=1.5,afade=t=out:st=6.5:d=1.5," +
  "volume=-24dB,adelay=454792|454792[gesture]");
filter.push("[cue0][cue1][cue2][cue3][gesture]amix=inputs=5:duration=longest:normalize=0[bed]");
filter.push("[0:a]asplit=2[original][detector]");
filter.push("[bed][detector]sidechaincompress=threshold=0.06:ratio=5:attack=20:release=350[ducked]");
filter.push("[original][ducked]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.98:level=false[mix]");

execFileSync("ffmpeg", ["-v", "error", "-nostats", "-n", "-i", input,
  ...cues.flatMap(c => ["-i", c.path]), "-filter_complex", filter.join(";"),
  "-map", "0:v:0", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
  "-ac", "2", "-t", "469.9", "-movflags", "+faststart", output], { stdio: "inherit", timeout: 3600000 });
writeFileSync(output.replace(/\.mp4$/, ".json"), JSON.stringify({ input, output, status: "held_for_producer_review",
  picture: "H.264 video packets copied from r8 v2; no picture edit.",
  audio: "Original r8 mix retained, four screened instrumental cues layered with speech-triggered ducking; opening score/ambience unchanged.",
  cues, gestureLift: { startMs: 454792, endMs: 462792, gainDb: -24 }, filter: filter.join(";") }, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, cues: cues.map(c => c.name) }));
