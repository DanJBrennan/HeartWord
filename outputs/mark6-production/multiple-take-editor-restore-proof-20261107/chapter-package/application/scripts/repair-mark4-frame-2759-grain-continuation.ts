/**
 * Producer-directed picture-only repair.  Frames 2759–2774 in the Mark 4
 * review cut restart the earlier seed-in-furrow coverage.  Replace exactly
 * those sixteen frames with the next sixteen native frames of the immediately
 * preceding grain take.  The review clock and every audio sample stay intact.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const assets = join(getDataDir(), "assets");
const inputRel = "generated/chapter/mark4-autonomous-overnight-final-v25-post3034-continuity-frame-locked.mp4";
const grainRel = "generated/assembled/b44bc795-9857-443f-ad16-bf4af6ab8715.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v26-grain-continuation-frame-locked.mp4";
const input = join(assets, inputRel), grain = join(assets, grainRel), output = join(assets, outputRel);
const firstFrame = 2759, lastFrame = 2774, replacementFrames = lastFrame - firstFrame + 1;
const frameCount = 13231, grainLastShownFrame = 70;
if (![input, grain].every(existsSync)) throw new Error("The locked review cut or its approved grain source is missing.");

// The frame immediately before the repair is source frame 70 of this native
// grain take (SSIM 0.96).  Continue with frames 71–86 rather than replaying
// the seed-furrow take.
const filters = [
  `[0:v]trim=start_frame=0:end_frame=${firstFrame},setpts=PTS-STARTPTS[a]`,
  `[1:v]trim=start_frame=${grainLastShownFrame + 1}:end_frame=${grainLastShownFrame + 1 + replacementFrames},setpts=PTS-STARTPTS[b]`,
  `[0:v]trim=start_frame=${lastFrame + 1}:end_frame=${frameCount},setpts=PTS-STARTPTS[c]`,
  "[a][b][c]concat=n=3:v=1:a=0[video]"
].join(";");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-i", grain, "-filter_complex", filters,
  "-map", "[video]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
  "-c:a", "copy", "-movflags", "+faststart", output], { stdio: ["ignore", "ignore", "pipe"] });
const probe = execFileSync("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v:0",
  "-show_entries", "stream=nb_read_packets,avg_frame_rate", "-of", "default=noprint_wrappers=1", output], { encoding: "utf8" });
if (!probe.includes(`nb_read_packets=${frameCount}`) || !probe.includes("avg_frame_rate=24/1")) {
  throw new Error("The repair did not preserve the frame-review contract.");
}

const db = getDb(), id = randomUUID();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outputRel, Math.round(frameCount / 24 * 1000), 92, Date.now());
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(id,
      JSON.stringify({ pictureBase: inputRel, firstFrame, lastFrame, replacement: "native continuing frames 71-86 from approved grain take" }),
      JSON.stringify({ audioUnchangedFrom: inputRel, reason: "Producer-directed picture-only duplicate removal." }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, firstFrame, lastFrame, replacementFrames }, null, 2));
