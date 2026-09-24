/** Join the six reviewed, source-contiguous sections into one Mark 3 producer cut. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDataDir, getDb } from "../src/db/client.js";

const db = getDb(), root = join(getDataDir(), "assets");
const project = "0b386bfc-7919-4f40-91af-e198508a8267";
const sections = [
  { path: "generated/video/review/mark3-scene1-opening-full-source-review-r1.mp4", start: 0, end: 41733, frames: 1002 },
  { path: "generated/video/review/mark3-scene1-shot4-through-exit-review-r2.mp4", start: 41733, end: 92799, frames: 1226 },
  { path: "generated/video/review/mark3-scene2-full-source-review-r1.mp4", start: 92799, end: 172258, frames: 1907 },
  { path: "generated/video/review/mark3-scene3-full-source-review-r1.mp4", start: 172258, end: 245262, frames: 1752 },
  { path: "generated/video/review/mark3-scene4-full-source-review-r2.mp4", start: 245262, end: 371645, frames: 3033 },
  { path: "generated/video/review/mark3-scene5-full-source-review-r2.mp4", start: 371645, end: 430352, frames: 1409 },
];
if (sections.some((s, i) => s.end <= s.start || (i && s.start !== sections[i - 1]!.end) || !existsSync(join(root, s.path)))) throw new Error("Chapter sections missing or discontinuous.");
const opening = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=? AND undone=0")
  .get(project, "mark3-scene1-opening-source-coverage-r1") as { payload: string } | undefined;
if (!opening) throw new Error("Opening editable coverage not selected.");
for (const [scene, version] of [[2, 1], [3, 1], [4, 2], [5, 1]]) {
  const key = scene === 2 ? "mark3-scene2-complete-source-picture-coverage-v1" : `mark3-scene${scene}-complete-source-picture-coverage-r${version}`;
  const row = db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND idempotency_key=? AND undone=0").get(project, key);
  if (!row) throw new Error(`Scene ${scene} editable coverage not selected.`);
}
for (const s of sections) {
  const streams = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,nb_frames,width,height", "-of", "json", join(root, s.path)], { encoding: "utf8" })) as {
    streams: Array<{ codec_type: string; nb_frames?: string; width?: number; height?: number }>;
  };
  const v = streams.streams.find(x => x.codec_type === "video");
  if (Number(v?.nb_frames) !== s.frames || v?.width !== 1280 || v?.height !== 720 || !streams.streams.some(x => x.codec_type === "audio")) throw new Error(`Section QC failed: ${s.path}`);
}
const output = join(root, "generated/video/review/mark3-full-chapter-source-review-r1.mp4");
const work = mkdtempSync(join(tmpdir(), "heartword-mark3-chapter-"));
try {
  const list = join(work, "sections.txt");
  writeFileSync(list, sections.map(s => `file '${join(root, s.path).replaceAll("\\", "/")}'`).join("\n"));
  execFileSync("ffmpeg", ["-v", "error", "-nostats", "-y", "-f", "concat", "-safe", "0", "-i", list,
    "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-movflags", "+faststart", output],
    { stdio: ["ignore", "ignore", "pipe"], timeout: 1_800_000, maxBuffer: 64 * 1024 * 1024 });
} finally { rmSync(work, { recursive: true, force: true }); }
const rendered = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,nb_frames,duration", "-of", "json", output], { encoding: "utf8" })) as {
  streams: Array<{ codec_type: string; nb_frames?: string; duration?: string }>;
};
const actualFrames = Number(rendered.streams.find(s => s.codec_type === "video")?.nb_frames);
const audioSeconds = Number(rendered.streams.find(s => s.codec_type === "audio")?.duration);
if (actualFrames !== sections.reduce((n, s) => n + s.frames, 0) || Math.abs(audioSeconds - 430.352) > 0.15)
  throw new Error(`Incomplete chapter render: ${actualFrames} frames, ${audioSeconds}s audio`);
const sceneManifests = [2, 3, 4, 5].map(scene => {
  const version = scene === 4 ? 2 : 1;
  const path = join(root, `generated/video/review/mark3-scene${scene}-full-source-review-r${version}.json`);
  return { scene, manifest: JSON.parse(readFileSync(path, "utf8")) };
});
const manifest = { project, sourceStartMs: 0, sourceEndMs: 430352, sections, expectedFrames: sections.reduce((n, s) => n + s.frames, 0),
  opening: JSON.parse(readFileSync(join(root, "generated/video/review/mark3-scene1-opening-full-source-review-r1.json"), "utf8")), sceneManifests,
  note: "Producer review only; all selected shots remain independently editable. Approved source/cast audio was not replaced with provider audio. This six-section stream-copy review retains one DTS irregularity reported by an ffmpeg null-mux decode at an early section seam; it is not a normalized final export." };
writeFileSync(output.replace(/\.mp4$/, ".json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ output, expectedFrames: manifest.expectedFrames, expectedAudioMs: 430352 }));
// The source sections mix mono and stereo AAC. Re-encode their audio as one
// stereo stream before treating the chapter cut as playable producer review.
await import("./repair-mark3-chapter-review-audio.js");
