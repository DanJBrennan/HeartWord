/**
 * Replace the confirmed five-frame thorn interruption with a short,
 * motion-preserving extension of the immediately preceding thorn footage.
 * This is a producer-authorized picture-only repair; chapter audio and
 * duration are copied unchanged.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir(), assets = join(dataDir, "assets"), db = getDb();
const priorRel = "generated/chapter/mark4-autonomous-overnight-final-v22-confirmed-flash-repairs.mp4";
const outRel = "generated/chapter/mark4-autonomous-overnight-final-v23-thorn-continuity-repair.mp4";
const prior = join(assets, priorRel), out = join(assets, outRel);
const fps = 24, total = 551.292;

// Frames 2312–2316 were the held short interruption. Re-time frames 2308–2311
// into that window, retaining visible thorn motion and making one continuous
// thorn run before the intended wheat cut at frame 2317.
const extensionStartFrame = 2308, extensionEndExclusive = 2317;
const extensionSourceEndFrame = 2312;
const start = extensionStartFrame / fps;
const end = extensionEndExclusive / fps;
const sourceEnd = extensionSourceEndFrame / fps;
const multiplier = (end - start) / (sourceEnd - start);

if (!existsSync(prior)) throw new Error(`Missing approved input: ${priorRel}`);
const filter = `[0:v]trim=start=0:end=${start},setpts=PTS-STARTPTS[before];` +
  `[0:v]trim=start=${start}:end=${sourceEnd},setpts=${multiplier}*(PTS-STARTPTS),fps=${fps},trim=duration=${end - start},setpts=PTS-STARTPTS[extended];` +
  `[0:v]trim=start=${end}:end=${total},setpts=PTS-STARTPTS[after];` +
  `[before][extended][after]concat=n=3:v=1:a=0[video]`;
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", prior, "-filter_complex", filter,
  "-map", "[video]", "-map", "0:a:0", "-t", String(total), "-c:v", "libx264", "-preset", "medium", "-crf", "18",
  "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out], { stdio: ["ignore", "ignore", "pipe"] });
const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out], { encoding: "utf8" }).trim()) * 1000);
if (Math.abs(durationMs - Math.round(total * 1000)) > 150) throw new Error("Thorn continuity repair changed the protected chapter duration.");

const id = randomUUID();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outRel, durationMs, 166, Date.now());
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,
    JSON.stringify([{ kind: "approved_flash_repair", firstFrame: 2312, lastFrame: 2316, method: "motion_preserving_preceding_thorn_extension" }]),
    JSON.stringify({ pictureBase: priorRel, audioUnchanged: true, revision: "Producer-approved repair of the thorn micro-run by re-timing immediately preceding thorn motion." }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outRel, durationMs, repairedFrames: [2312, 2316] }, null, 2));
