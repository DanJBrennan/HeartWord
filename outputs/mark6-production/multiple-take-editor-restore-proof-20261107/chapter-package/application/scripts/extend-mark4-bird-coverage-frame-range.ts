/** Extend Mark 4:4's approved bird coverage across the producer-marked 16-frame span. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir(), assets = join(dataDir, "assets"), db = getDb();
const prior = "generated/chapter/mark4-autonomous-overnight-final-v19-canon-and-motion.mp4";
const birds = "generated/assembled/7d0820da-e220-4962-b711-ccc42447017b.mp4";
const outRel = "generated/chapter/mark4-autonomous-overnight-final-v20-bird-frame-extension.mp4", out = join(assets, outRel);
const total = 551.292, fps = 24, firstFrame = 1491, lastFrame = 1506;
const replaceStart = firstFrame / fps, replaceEnd = (lastFrame + 1) / fps;
const birdContinuationStart = 2, birdContinuationEnd = birdContinuationStart + replaceEnd - replaceStart;
for (const path of [prior, birds]) if (!existsSync(join(assets, path))) throw new Error(`Missing approved input: ${path}`);
const filter = `[0:v]trim=start=0:end=${replaceStart},setpts=PTS-STARTPTS[before];` +
  `[1:v]trim=start=${birdContinuationStart}:end=${birdContinuationEnd},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=${fps},setpts=PTS-STARTPTS[birds];` +
  `[0:v]trim=start=${replaceEnd}:end=${total},setpts=PTS-STARTPTS[after];[before][birds][after]concat=n=3:v=1:a=0[video]`;
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(assets, prior), "-i", join(assets, birds),
  "-filter_complex", filter, "-map", "[video]", "-map", "0:a:0", "-t", String(total),
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out],
  { stdio: ["ignore", "ignore", "pipe"] });
const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out], { encoding:"utf8" }).trim()) * 1000);
if (Math.abs(durationMs - Math.round(total * 1000)) > 150) throw new Error("Bird extension changed the protected chapter duration.");
const id = randomUUID(); db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outRel, durationMs, 166, Date.now());
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,
    JSON.stringify([{ kind:"approved_bird_frame_extension", firstFrame, lastFrame, startMs:Math.round(replaceStart * 1000), endMs:Math.round(replaceEnd * 1000) }]),
    JSON.stringify({ pictureBase:prior, audioUnchanged:true, sourceVerse:"Mark 4:4", revision:"Producer requested frames 1491 through 1506 be replaced by the continuing approved bird coverage." }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outRel, durationMs, firstFrame, lastFrame, frameCount:lastFrame - firstFrame + 1 }, null, 2));
