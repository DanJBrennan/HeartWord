/** Preserve the 24-fps, 13,231-frame Mark 4 review contract after the distinct-coverage rebuild. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const assets = join(getDataDir(), "assets");
const inputRel = "generated/chapter/mark4-autonomous-overnight-final-v27-distinct-coverage.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v28-distinct-coverage-frame-locked.mp4";
const input = join(assets, inputRel), output = join(assets, outputRel), frameCount = 13231;
if (!existsSync(input)) throw new Error("The distinct-coverage candidate is unavailable.");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-frames:v", String(frameCount), "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-movflags", "+faststart", output], { stdio: ["ignore", "ignore", "pipe"] });
const probe = execFileSync("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets,avg_frame_rate", "-of", "default=noprint_wrappers=1", output], { encoding: "utf8" });
if (!probe.includes(`nb_read_packets=${frameCount}`) || !probe.includes("avg_frame_rate=24/1")) throw new Error("Frame lock failed.");
const db = getDb(), id = randomUUID();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outputRel, Math.round(frameCount / 24 * 1000), 43, Date.now());
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(id, JSON.stringify({ pictureBase: inputRel, frameCount, frameRate: 24, rule: "distinct coverage, no cyclic fallback" }), JSON.stringify({ audioUnchangedFrom: inputRel }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, frameCount }, null, 2));
