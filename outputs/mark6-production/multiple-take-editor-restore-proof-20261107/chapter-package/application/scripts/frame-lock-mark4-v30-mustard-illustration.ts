/** Frame-lock the approved Mark 4:31–32 picture-only mustard illustration. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0", frameCount = 13231;
const assets = join(getDataDir(), "assets");
const inputRel = "generated/chapter/mark4-autonomous-overnight-final-v30-mustard-illustration-frame-locked.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v31-mustard-illustration-frame-locked.mp4";
const input = join(assets, inputRel), output = join(assets, outputRel);
if (!existsSync(input)) throw new Error("The unpromoted mustard illustration render is missing.");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-frames:v", String(frameCount), "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-movflags", "+faststart", output], { stdio: "inherit" });
const probe = execFileSync("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets,avg_frame_rate", "-of", "default=noprint_wrappers=1", output], { encoding: "utf8" });
if (!probe.includes(`nb_read_packets=${frameCount}`) || !probe.includes("avg_frame_rate=24/1")) throw new Error("Frame lock failed.");
const hash = (file: string) => execFileSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"], { encoding: "utf8" }).trim();
const prior = join(assets, "generated/chapter/mark4-autonomous-overnight-final-v29-distinct-coverage-grain-repair-frame-locked.mp4");
if (hash(prior) !== hash(output)) throw new Error("Audio changed while frame-locking the picture-only replacement.");
const db = getDb(), id = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outputRel, Math.round(frameCount / 24 * 1000), 6, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(id, JSON.stringify({ pictureBase: inputRel, frameCount, replaceFrames: [9148, 9785], approvedIllustration: true }), JSON.stringify({ audioUnchangedFrom: "generated/chapter/mark4-autonomous-overnight-final-v29-distinct-coverage-grain-repair-frame-locked.mp4" }));
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'project',?,'human',?,1,?)")
    .run(randomUUID(), projectId, projectId, "Producer-approved Mark 4:31–32 mustard-seed illustration promoted as a frame-locked, picture-only replacement.", now);
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, frameCount, audioUnchanged: true }, null, 2));
