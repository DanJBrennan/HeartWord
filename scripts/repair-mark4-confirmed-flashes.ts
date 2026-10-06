/** Repair only the producer-approved discontinuous flash ranges in the Mark 4 review cut. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir(), assets = join(dataDir, "assets"), db = getDb();
const prior = "generated/chapter/mark4-autonomous-overnight-final-v21-wide-before-mark4-3-speaking.mp4";
const birds = "generated/assembled/7d0820da-e220-4962-b711-ccc42447017b.mp4";
const thorns = "generated/assembled/24d79583-696a-4ed3-a18a-9a059398f59c.mp4";
const outRel = "generated/chapter/mark4-autonomous-overnight-final-v22-confirmed-flash-repairs.mp4", out = join(assets, outRel);
const total = 551.292, fps = 24;
const birdFirst = 1486, birdLast = 1506, thornFirst = 2312, thornLast = 2316;
const birdStart = birdFirst / fps, birdEnd = (birdLast + 1) / fps;
const thornStart = thornFirst / fps, thornEnd = (thornLast + 1) / fps;
// The retained bird source was already active at 0.333 s immediately before
// the damaged boundary; extend that same motion continuously through 1506.
const birdSourceStart = 1 / 3, birdSourceEnd = birdSourceStart + birdEnd - birdStart;
// This is the thorn take's continuation at the exact program boundary.
const thornSourceStart = thornStart - (11.5 + 83.939), thornSourceEnd = thornSourceStart + thornEnd - thornStart;
for (const path of [prior, birds, thorns]) if (!existsSync(join(assets, path))) throw new Error(`Missing approved input: ${path}`);
const filter = `[0:v]trim=start=0:end=${birdStart},setpts=PTS-STARTPTS[a];` +
  `[1:v]trim=start=${birdSourceStart}:end=${birdSourceEnd},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=${fps},setpts=PTS-STARTPTS[b];` +
  `[0:v]trim=start=${birdEnd}:end=${thornStart},setpts=PTS-STARTPTS[c];` +
  `[2:v]trim=start=${thornSourceStart}:end=${thornSourceEnd},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=${fps},setpts=PTS-STARTPTS[d];` +
  `[0:v]trim=start=${thornEnd}:end=${total},setpts=PTS-STARTPTS[e];[a][b][c][d][e]concat=n=5:v=1:a=0[video]`;
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(assets, prior), "-i", join(assets, birds), "-i", join(assets, thorns),
  "-filter_complex", filter, "-map", "[video]", "-map", "0:a:0", "-t", String(total),
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out],
  { stdio: ["ignore", "ignore", "pipe"] });
const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out], { encoding: "utf8" }).trim()) * 1000);
if (Math.abs(durationMs - Math.round(total * 1000)) > 150) throw new Error("Flash repairs changed the protected chapter duration.");
const id = randomUUID(); db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outRel, durationMs, 166, Date.now());
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,
    JSON.stringify([{ kind: "approved_flash_repair", firstFrame: birdFirst, lastFrame: birdLast }, { kind: "approved_flash_repair", firstFrame: thornFirst, lastFrame: thornLast }]),
    JSON.stringify({ pictureBase: prior, audioUnchanged: true, revision: "Producer-approved repair of only the visually discontinuous bird and thorn micro-runs; continuous short frames remain untouched." }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outRel, durationMs, repairs: [{ firstFrame: birdFirst, lastFrame: birdLast }, { firstFrame: thornFirst, lastFrame: thornLast }] }, null, 2));
