/** Keep Mark 4:5's rocky-ground coverage continuous instead of flashing the green fallback. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir(), assets = join(dataDir, "assets"), db = getDb();
const prior = "generated/chapter/mark4-autonomous-overnight-final-v16-thorny-soil-continuity.mp4";
const rockyFallback = "generated/assembled/06922215-fddd-4bb5-bfc7-583b9bd3f805.mp4";
const outRel = "generated/chapter/mark4-autonomous-overnight-final-v18-rocky-ground-continuity.mp4", out = join(assets, outRel);
const total = 551.292, flashStart = 74.580, flashEnd = 75.400, cleanFallbackStart = 0.300;
for (const path of [prior, rockyFallback]) if (!existsSync(join(assets, path))) throw new Error(`Missing approved input: ${path}`);

const filter = `[0:v]trim=start=0:end=${flashStart},setpts=PTS-STARTPTS[before];` +
  `[1:v]trim=start=${cleanFallbackStart}:end=${(cleanFallbackStart + flashEnd - flashStart).toFixed(3)},` +
  `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=24,setpts=PTS-STARTPTS[rockyContinuation];` +
  `[0:v]trim=start=${flashEnd}:end=${total},setpts=PTS-STARTPTS[after];` +
  `[before][rockyContinuation][after]concat=n=3:v=1:a=0[video]`;
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(assets, prior), "-i", join(assets, rockyFallback),
  "-filter_complex", filter, "-map", "[video]", "-map", "0:a:0", "-t", String(total),
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out],
  { stdio: ["ignore", "ignore", "pipe"] });
const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out], { encoding: "utf8" }).trim()) * 1000);
if (Math.abs(durationMs - Math.round(total * 1000)) > 150) throw new Error("Rocky-ground revision changed the protected chapter duration.");
const id = randomUUID(); db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outRel, durationMs, 166, Date.now());
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,
    JSON.stringify([{ kind: "approved_rocky_ground_continuation", startMs: Math.round(flashStart * 1000), endMs: Math.round(flashEnd * 1000) }]),
    JSON.stringify({ pictureBase: prior, audioUnchanged: true, sourceVerse: "Mark 4:5", revision: "Replace the two-frame green fallback flash with the clean, continuous portion of its approved rocky-ground fallback." }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outRel, durationMs, replacedFlashMs: Math.round((flashEnd - flashStart) * 1000) }, null, 2));
