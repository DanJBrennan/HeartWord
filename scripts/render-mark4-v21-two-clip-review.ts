/** Assemble the bounded Mark 4:21 two-shot pilot for producer review.
 * The continuous cast-audio line is preserved; this never selects a timeline clip. */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const shotId = "611a8078-e67e-47c3-9cff-8c920809798e";
const originalId = "f13972b1-1558-466c-abd8-68cc4a083d37";
const dataDir = getDataDir();
const db = getDb();
const clips = [
  { path: "generated/video/mark4-v21-two-clip-base-1-933006993462919258.mp4", duration: 3.680 },
  { path: "generated/lipsync-face/933009326326415400.mp4", duration: 4.716 },
];
const audio = db.prepare(`SELECT c.source_path FROM composite_audio_source_map m
  JOIN audio_segments c ON c.id=m.composite_segment_id WHERE m.original_segment_id=?`)
  .get(originalId) as { source_path: string } | undefined;
if (!audio || clips.some(clip => !existsSync(join(dataDir, "assets", clip.path))) || !existsSync(join(dataDir, "assets", audio.source_path))) {
  throw Error("Required Mark 4:21 pilot media is unavailable.");
}
const rel = "generated/chapter/mark4-v21-two-clip-pilot-review.mp4";
const output = join(dataDir, "assets", rel);
if (existsSync(output)) throw new Error("Retained two-clip review exists; choose a new revision.");
mkdirSync(join(dataDir, "assets", "generated", "chapter"), { recursive: true });
const filter = clips.map((clip, index) =>
  `[${index}:v]trim=duration=${clip.duration.toFixed(3)},setpts=PTS-STARTPTS,scale=1904:1072,setsar=1[v${index}]`,
).join(";") + ";[v0][v1]concat=n=2:v=1:a=0[v]";
execFileSync("ffmpeg", [
  "-v", "error", "-y", ...clips.flatMap(clip => ["-i", join(dataDir, "assets", clip.path)]),
  "-i", join(dataDir, "assets", audio.source_path), "-filter_complex", filter,
  "-map", "[v]", "-map", "2:a:0", "-af", "apad=pad_dur=0.020", "-t", "8.396",
  "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output,
], { stdio: ["ignore", "ignore", "pipe"] });
const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", output], { encoding: "utf8" }).trim());
if (Math.abs(duration - 8.396) > 0.1) throw Error(`Review reel duration drifted to ${duration}s.`);
const id = randomUUID();
const now = Date.now();
db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
  VALUES (?,?,'local_ffmpeg','source-bound-two-clip-review','assemble_coverage_pilot','1904x1072',?,'hold_for_review',?,?,?)`)
  .run(id, shotId, "Mark 4:21 two-clip pilot: automated source-pause cut at 3680 ms; original source slices 0-3680 and 3680-8396 ms; visually verified Jesus lip sync only in segment 2; continuous approved cast-audio track; review-only, no timeline selection.", rel, 0, now);
console.log(JSON.stringify({ attemptId: id, path: rel, durationSeconds: duration }, null, 2));
