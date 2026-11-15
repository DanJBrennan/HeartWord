/**
 * Put the approved, source-bound first Mark 4:30 Jesus performance exactly at
 * the producer-reviewed narration-to-Jesus handoff. This is picture-only;
 * the chapter's source/cast mix and decoded-frame clock remain locked.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const dataDir = getDataDir(), assets = join(dataDir, "assets");
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const fps = 24, totalFrames = 13231;
const baseRel = "generated/chapter/mark4-autonomous-overnight-final-v33-canon-storm-repair-frame-locked.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v34-v30-opening-lipsync-frame-locked.mp4";
const sourceBoundPerformance = "generated/lipsync-face/933023241076736086.mp4";
// Dan identified this decoded-frame boundary in the final reviewer.
const startFrame = 8947, endFrameExclusive = 9033;
for (const path of [baseRel, sourceBoundPerformance]) if (!existsSync(join(assets, path))) throw new Error(`Missing approved input: ${path}`);

const output = join(assets, outputRel);
const filter = [
  `[0:v]trim=start_frame=0:end_frame=${startFrame},setpts=PTS-STARTPTS[prefix]`,
  // This retained lip-sync is 30 fps. Normalize before selecting the 24-fps
  // chapter frames so its intended 3.583-second source turn is not shortened.
  `[1:v]fps=${fps},trim=start_frame=0:end_frame=${endFrameExclusive - startFrame},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,setpts=PTS-STARTPTS[performance]`,
  `[0:v]trim=start_frame=${endFrameExclusive}:end_frame=${totalFrames},setpts=PTS-STARTPTS[suffix]`,
  `[prefix][performance][suffix]concat=n=3:v=1:a=0[video]`
].join(";");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(assets, baseRel), "-i", join(assets, sourceBoundPerformance), "-filter_complex", filter, "-map", "[video]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output], { stdio: "inherit" });

const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
const audioHash = (path: string) => createHash("md5").update(execFileSync("ffmpeg", ["-v", "error", "-i", path, "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"], { encoding: "buffer" })).digest("hex");
if (frames !== totalFrames) throw new Error(`Frame lock failed: expected ${totalFrames}, received ${frames}.`);
if (audioHash(join(assets, baseRel)) !== audioHash(output)) throw new Error("Audio stream changed during picture-only replacement.");

const db = getDb(), id = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outputRel, Math.round(totalFrames / fps * 1000), 3, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(id, JSON.stringify({ pictureBase: baseRel, replaceFrames: [startFrame, endFrameExclusive - 1], sourceBoundPerformance, sourceRef: "Mark 4:30 first Jesus interval" }), JSON.stringify({ audioUnchangedFrom: baseRel, reason: "Producer-directed placement of approved source-bound Mark 4:30 performance at narration handoff." }));
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'project',?,'human',?,1,?)")
    .run(randomUUID(), projectId, projectId, "Dan directed the approved first Mark 4:30 Jesus performance be placed at final-cut frame 8947, immediately after the narrator handoff; the unrelated later talking coverage is not used as a lip-sync substitute.", now);
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, frames, replaceFrames: [startFrame, endFrameExclusive - 1], audioMd5: audioHash(output) }, null, 2));
