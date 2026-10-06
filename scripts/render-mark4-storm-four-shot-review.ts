/** A review-only reel of the four producer-approved Mark 4 storm performances.
 * It does not alter the chapter timeline, source audio, or selected clips.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const shots = [
  ["Peter’s plea — Mark 4:38", "6db6f5f1-ced4-4675-82f4-05c772333d01"],
  ["Jesus’s command — Mark 4:39", "c02b7bd2-d16d-4163-b7a0-88f32ae3e1dd"],
  ["Jesus’s question, beat 1 — Mark 4:40", "89ba4fb7-5e0a-4049-b4f2-6ec9fc778d64"],
  ["Jesus’s question, beat 2 — Mark 4:40", "404d00a7-a0c5-4d64-ae50-281e60f93302"]
] as const;
const db = getDb(), dataDir = getDataDir();
const clips = shots.map(([label, shotId]) => {
  const row = db.prepare(`SELECT ga.result_asset_path FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id
    WHERE c.shot_id=? AND ga.operation='lip_sync' AND ga.status='accepted' ORDER BY ga.created_at DESC LIMIT 1`).get(shotId) as { result_asset_path: string } | undefined;
  if (!row) throw Error(`No approved storm clip found for ${label}.`);
  return { label, path: join(dataDir, "assets", row.result_asset_path) };
});
const output = join(dataDir, "assets", "generated", "review", "mark4-storm-four-performances.mp4");
const manifest = output.replace(/\.mp4$/, ".json");
mkdirSync(dirname(output), { recursive: true });
const filters = clips.flatMap((_, index) => [
  `[${index}:v]setpts=PTS-STARTPTS,scale=1904:1072:force_original_aspect_ratio=decrease,pad=1904:1072:(ow-iw)/2:(oh-ih),fps=24[v${index}]`,
  `[${index}:a]asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo[a${index}]`
]).concat([`${clips.map((_, index) => `[v${index}][a${index}]`).join("")}concat=n=${clips.length}:v=1:a=1[v][a]`]).join(";");
execFileSync("ffmpeg", ["-y", ...clips.flatMap((clip) => ["-i", clip.path]), "-filter_complex", filters, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-c:a", "aac", "-movflags", "+faststart", output], { stdio: ["ignore", "ignore", "pipe"] });
const totalMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", output], { encoding: "utf8" }).trim()) * 1000);
writeFileSync(manifest, JSON.stringify({ kind: "review_only_mark4_storm_four_performances", projectId, totalMs, clips: clips.map((clip) => clip.label), note: "Standalone producer preview. It does not change the Mark 4 timeline or source-audio assembly." }, null, 2));
console.log(JSON.stringify({ output, manifest, totalMs, clips: clips.map((clip) => clip.label) }, null, 2));
