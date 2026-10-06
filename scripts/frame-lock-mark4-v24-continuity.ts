/** Preserve the existing Mark 4 reviewer frame clock after the bounded continuity rebuild. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir(), assets = join(dataDir, "assets"), db = getDb();
const priorRel = "generated/chapter/mark4-autonomous-overnight-final-v24-post3034-continuity.mp4";
const outRel = "generated/chapter/mark4-autonomous-overnight-final-v25-post3034-continuity-frame-locked.mp4";
const prior = join(assets, priorRel), out = join(assets, outRel);
const expectedFrames = 13231, fps = 24;
if (!existsSync(prior)) throw new Error("The bounded continuity candidate is missing.");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", prior, "-frames:v", String(expectedFrames), "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-movflags", "+faststart", out], { stdio: ["ignore", "ignore", "pipe"] });
const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets,avg_frame_rate", "-of", "default=noprint_wrappers=1", out], { encoding: "utf8" });
if (!probe.includes(`nb_read_packets=${expectedFrames}`) || !probe.includes("avg_frame_rate=24/1")) throw new Error("Frame lock did not preserve the 24fps reviewer contract.");
const durationMs = Math.round(expectedFrames / fps * 1000);
const id = randomUUID();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outRel, durationMs, 92, Date.now());
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,
    JSON.stringify({ pictureBase: priorRel, frameCount: expectedFrames, frameRate: fps, frameClock: "zero-based decoded output frame" }),
    JSON.stringify({ audioUnchangedFrom: priorRel, reason: "Remove one encoder-rounded terminal picture frame; no source-clock or audio change." }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outRel, frameCount: expectedFrames, durationMs }, null, 2));
