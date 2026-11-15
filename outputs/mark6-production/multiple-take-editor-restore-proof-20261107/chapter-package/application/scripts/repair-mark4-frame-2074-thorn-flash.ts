/** Remove the confirmed one-frame Mark 4 thorn-coverage flash by extending the prior continuous frame. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0", frameCount = 13231, flash = 2074;
const assets = join(getDataDir(), "assets");
const inputRel = "generated/chapter/mark4-autonomous-overnight-final-v31-mustard-illustration-frame-locked.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v32-thorn-flash-repair-frame-locked.mp4";
const input = join(assets, inputRel), output = join(assets, outputRel);
if (!existsSync(input)) throw new Error("The current Mark 4 review candidate is unavailable.");
const filters = [
  `[0:v]trim=start_frame=0:end_frame=${flash},setpts=PTS-STARTPTS[a]`,
  `[0:v]trim=start_frame=${flash - 1}:end_frame=${flash},setpts=PTS-STARTPTS[b]`,
  `[0:v]trim=start_frame=${flash + 1}:end_frame=${frameCount},setpts=PTS-STARTPTS[c]`,
  "[a][b][c]concat=n=3:v=1:a=0[video]"
].join(";");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-filter_complex", filters, "-map", "[video]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output], { stdio: "inherit" });
const probe = execFileSync("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets,avg_frame_rate", "-of", "default=noprint_wrappers=1", output], { encoding: "utf8" });
if (!probe.includes(`nb_read_packets=${frameCount}`) || !probe.includes("avg_frame_rate=24/1")) throw new Error("Frame lock failed after thorn-flash repair.");
const hash = (file: string) => execFileSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"], { encoding: "utf8" }).trim();
if (hash(input) !== hash(output)) throw new Error("Audio changed during one-frame thorn repair.");
const db = getDb(), id = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outputRel, Math.round(frameCount / 24 * 1000), 3, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(id, JSON.stringify({ pictureBase: inputRel, firstFrame: flash, lastFrame: flash, replacement: "continuous extension of frame 2073 thorn coverage" }), JSON.stringify({ audioUnchangedFrom: inputRel }));
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'project',?,'human',?,1,?)")
    .run(randomUUID(), projectId, projectId, "Producer-requested repair: replace the one-frame unrelated green-sprout flash at frame 2074 with continuous adjacent thorn coverage.", now);
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, repairedFrame: flash, audioUnchanged: true }, null, 2));
