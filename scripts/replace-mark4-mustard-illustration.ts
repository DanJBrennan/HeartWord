/**
 * Promotes Dan's approved Mark 4:31–32 mustard-seed illustration into the
 * chapter picture. The established audio stream and 24-fps frame clock are
 * copied unchanged; this is a narrowly scoped picture-only replacement.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const dataDir = getDataDir(), assets = join(dataDir, "assets");
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const baseRel = "generated/chapter/mark4-autonomous-overnight-final-v29-distinct-coverage-grain-repair-frame-locked.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v30-mustard-illustration-frame-locked.mp4";
const sourceStartFrame = 9148, seedEndFrame = 9346, plantingEndFrame = 9461, growthEndFrame = 9600, sourceEndFrame = 9786;
const totalFrames = 13231, fps = 24;
const takes = [
  "generated/video/mark4-mustard-seed-scale-fc401d5f-829b-4777-818e-6bde525164bd.mp4",
  "generated/video/mark4-mustard-planting-2480dc06-0213-4798-a695-036342d8255b.mp4",
  "generated/video/mark4-mustard-growth-a67d0440-66d0-413e-bf16-763ee91e8358.mp4",
  "generated/video/mark4-mustard-branches-and-birds-ace74219-b3a6-4789-a22f-a153f42abf22.mp4"
];
for (const path of [baseRel, ...takes]) if (!existsSync(join(assets, path))) throw new Error(`Required approved input is missing: ${path}`);

const durations = [
  (seedEndFrame - sourceStartFrame) / fps,
  (plantingEndFrame - seedEndFrame) / fps,
  (growthEndFrame - plantingEndFrame) / fps,
  (sourceEndFrame - growthEndFrame) / fps
];
const total = totalFrames / fps;
const filter = [
  `[0:v]trim=start_frame=0:end_frame=${sourceStartFrame},setpts=PTS-STARTPTS,fps=${fps},setsar=1[prefix]`,
  `[1:v]setpts=1.03125*PTS,trim=duration=${durations[0]!.toFixed(6)},fps=${fps},setsar=1[seed]`,
  `[2:v]trim=duration=${durations[1]!.toFixed(6)},setpts=PTS-STARTPTS,fps=${fps},setsar=1[planting]`,
  `[3:v]trim=duration=${durations[2]!.toFixed(6)},setpts=PTS-STARTPTS,fps=${fps},setsar=1[growth]`,
  `[4:v]trim=duration=${durations[3]!.toFixed(6)},setpts=PTS-STARTPTS,fps=${fps},setsar=1[birds]`,
  `[0:v]trim=start_frame=${sourceEndFrame}:end_frame=${totalFrames},setpts=PTS-STARTPTS,fps=${fps},setsar=1[suffix]`,
  `[prefix][seed][planting][growth][birds][suffix]concat=n=6:v=1:a=0[video]`
].join(";");
const output = join(assets, outputRel);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(assets, baseRel), ...takes.flatMap((path) => ["-i", join(assets, path)]),
  "-filter_complex", filter, "-map", "[video]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output], { stdio: "inherit" });

const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
if (frames !== totalFrames) throw new Error(`Frame lock failed: expected ${totalFrames}, received ${frames}.`);
const audioHash = (path: string) => createHash("md5").update(execFileSync("ffmpeg", ["-v", "error", "-i", path, "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"], { encoding: "buffer" })).digest("hex");
if (audioHash(join(assets, baseRel)) !== audioHash(output)) throw new Error("Audio stream changed during picture-only mustard replacement.");

const db = getDb(), id = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outputRel, Math.round(total * 1000), 6, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(id, JSON.stringify({ pictureBase: baseRel, replaceFrames: [sourceStartFrame, sourceEndFrame - 1], approvedIllustration: takes, segments: ["seed in Jesus's hand", "planting", "growth", "branches and nesting birds"], exactFrameBoundaries: [sourceStartFrame, seedEndFrame, plantingEndFrame, growthEndFrame, sourceEndFrame] }),
      JSON.stringify({ audioUnchangedFrom: baseRel, reason: "Producer-approved Mark 4:31–32 picture-only mustard-seed illustration." }));
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'project',?,'human',?,1,?)")
    .run(randomUUID(), projectId, projectId, "Producer approved the four-beat Mark 4:31–32 mustard-seed motion reel; promoted as a picture-only replacement with locked audio and frame count.", now);
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, frames, replaces: [sourceStartFrame, sourceEndFrame - 1], audioMd5: audioHash(output) }, null, 2));
