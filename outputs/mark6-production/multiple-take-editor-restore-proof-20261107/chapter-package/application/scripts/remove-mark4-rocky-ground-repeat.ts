/** Replace the repeated Mark 4:6 fallback with unused continuous motion from its approved take. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir(), assets = join(dataDir, "assets"), db = getDb();
const prior = "generated/chapter/mark4-autonomous-overnight-final-v14-bird-coverage.mp4";
const rockyGround = "generated/assembled/f2d9bebb-77a7-4a38-8cb2-1f35ca06a711.mp4";
const outRel = "generated/chapter/mark4-autonomous-overnight-final-v15-rocky-ground-continuity.mp4", out = join(assets, outRel);
const total = 551.292, repeatStart = 85.502, repeatEnd = 86.336, continuationStart = 2.102;
for (const path of [prior, rockyGround]) if (!existsSync(join(assets, path))) throw new Error(`Missing approved input: ${path}`);
const filter = `[0:v]trim=start=0:end=${repeatStart},setpts=PTS-STARTPTS[before];` +
  `[1:v]trim=start=${continuationStart}:end=${(continuationStart + repeatEnd - repeatStart).toFixed(3)},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=24,setpts=PTS-STARTPTS[continuation];` +
  `[0:v]trim=start=${repeatEnd}:end=${total},setpts=PTS-STARTPTS[after];[before][continuation][after]concat=n=3:v=1:a=0[video]`;
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(assets, prior), "-i", join(assets, rockyGround),
  "-filter_complex", filter, "-map", "[video]", "-map", "0:a:0", "-t", String(total),
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out],
  { stdio: ["ignore", "ignore", "pipe"] });
const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out], { encoding: "utf8" }).trim()) * 1000);
if (Math.abs(durationMs - Math.round(total * 1000)) > 150) throw new Error("Rocky-ground continuity revision changed the protected chapter duration.");
const id = randomUUID(); db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id, projectId, outRel, durationMs, 166, Date.now());
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,
    JSON.stringify([{ kind: "approved_rocky_ground_continuation", startMs: Math.round(repeatStart * 1000), endMs: Math.round(repeatEnd * 1000) }]),
    JSON.stringify({ pictureBase: prior, audioUnchanged: true, sourceVerse: "Mark 4:6", revision: "Replace repeated fallback with unused continuous motion from the same approved take." }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outRel, durationMs, replacedRepeatMs: Math.round((repeatEnd - repeatStart) * 1000) }, null, 2));
