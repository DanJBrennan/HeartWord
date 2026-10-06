/** Held v64: correct the remaining measured within-scene colour outliers. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0", total = 13831;
const inputRel = "generated/chapter/mark4-autonomous-overnight-final-v63-selective-scene-grade-held.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v64-outlier-colour-match-held.mp4";
type Patch = { start: number; end: number; filter: string; reason: string };
// Ranges are existing v63 shot boundaries. Night-to-dawn transitions are
// intentional scene changes and deliberately excluded from this pass.
const patches: Patch[] = [
  { start: 1438, end: 1507, filter: "eq=brightness=0.140:contrast=1.00:saturation=0.94,colorbalance=rs=-0.020:bs=0.020", reason: "Scene 1 dark crop insert" },
  { start: 1704, end: 1813, filter: "eq=brightness=0.090:contrast=1.00:saturation=0.96", reason: "Scene 1 dark listener" },
  { start: 2053, end: 2088, filter: "eq=brightness=0.100:contrast=1.00:saturation=0.95", reason: "Scene 1 dark grain insert" },
  { start: 2317, end: 2479, filter: "eq=brightness=0.060:contrast=1.00:saturation=0.90,colorbalance=rs=-0.040:bs=0.040", reason: "Scene 1 over-warm wheat insert" },
  { start: 8148, end: 8316, filter: "eq=brightness=0.120:contrast=1.00:saturation=0.94,colorbalance=rs=0.060:bs=-0.060", reason: "Scene 5 cool shore transition" },
  { start: 8620, end: 8700, filter: "eq=brightness=0.120:contrast=1.00:saturation=0.94,colorbalance=rs=0.020:bs=-0.020", reason: "Scene 5 dark field illustration" },
  { start: 9888, end: 9918, filter: "eq=brightness=0.110:contrast=1.00:saturation=0.95,colorbalance=rs=0.010:bs=-0.010", reason: "Scene 6 dark mustard transition" }
];
const data = getDataDir(), assets = join(data, "assets"), input = join(assets, inputRel), output = join(assets, outputRel);
if (!existsSync(input)) throw new Error("Missing held v63 input.");
let cursor = 0;
const filters: string[] = [], labels: string[] = [];
for (const [index, patch] of patches.entries()) {
  if (cursor > patch.start) throw new Error("Overlapping v64 grade ranges.");
  if (cursor < patch.start) { const label = `plain${index}`; filters.push(`[0:v]trim=start_frame=${cursor}:end_frame=${patch.start},setpts=PTS-STARTPTS,setsar=1[${label}]`); labels.push(`[${label}]`); }
  const label = `grade${index}`; filters.push(`[0:v]trim=start_frame=${patch.start}:end_frame=${patch.end},setpts=PTS-STARTPTS,${patch.filter},setsar=1[${label}]`); labels.push(`[${label}]`); cursor = patch.end;
}
if (cursor < total) { filters.push(`[0:v]trim=start_frame=${cursor}:end_frame=${total},setpts=PTS-STARTPTS,setsar=1[tail]`); labels.push("[tail]"); }
filters.push(`${labels.join("")}concat=n=${labels.length}:v=1:a=0[v]`);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-filter_complex", filters.join(";"), "-map", "[v]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output], { stdio: "inherit" });
const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
if (frames !== total) throw new Error(`Expected ${total}, got ${frames}.`);
const db = getDb(), id = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try { db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id, projectId, outputRel, 576292, 115, now); db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id, JSON.stringify({ heldForReview: true, pictureBase: inputRel, sceneColourOutlierPatches: patches }), JSON.stringify({ audioBase: inputRel, sourceCastAudioCopied: true })); db.exec("COMMIT"); } catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, frames, heldForReview: true, patches }, null, 2));
