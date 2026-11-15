/**
 * Held v63 selective colour match.  It corrects only the measured v62
 * within-scene colour discontinuities; night storm and dawn retain their
 * deliberate colour worlds. Audio is copied unchanged.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const fps = 24;
const total = 13831;
const inputRel = "generated/chapter/mark4-autonomous-overnight-final-v62-no-duplicate-coverage-held.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v63-selective-scene-grade-held.mp4";

type Patch = { start: number; end: number; filter: string; reason: string };
// Boundaries are decoded v62 frame indices from the fixed scorecard's
// per-shot report. Each adjustment moves a cool/bright outlier toward the
// adjacent scene look; it does not alter the intended storm-night or dawn arc.
const patches: Patch[] = [
  { start: 707, end: 895, filter: "eq=brightness=-0.075:contrast=1.01:saturation=0.94,colorbalance=rs=0.018:bs=-0.018", reason: "Scene 1 bright cool boat outlier" },
  { start: 895, end: 1051, filter: "eq=brightness=0.035:contrast=1.01:saturation=0.94,colorbalance=rs=-0.012:bs=0.012", reason: "Scene 1 dark warm return" },
  { start: 1123, end: 1267, filter: "eq=brightness=-0.060:contrast=1.01:saturation=0.94,colorbalance=rs=0.030:bs=-0.030", reason: "Scene 1 4:3 performance match" },
  { start: 1438, end: 1507, filter: "eq=brightness=-0.065:contrast=1.01:saturation=0.92,colorbalance=rs=-0.018:bs=0.018", reason: "Scene 1 over-warm grain insert" },
  { start: 1704, end: 1813, filter: "eq=brightness=0.040:contrast=1.01:saturation=0.95,colorbalance=rs=0.010:bs=-0.010", reason: "Scene 1 dark listener return" },
  { start: 2053, end: 2088, filter: "eq=brightness=0.065:contrast=1.01:saturation=0.90,colorbalance=rs=-0.025:bs=0.025", reason: "Scene 1 dark crop transition" },
  { start: 2088, end: 2196, filter: "eq=brightness=-0.055:contrast=1.01:saturation=0.95,colorbalance=rs=0.024:bs=-0.024", reason: "Scene 1 cool performance return" },
  { start: 2196, end: 2317, filter: "eq=brightness=0.030:contrast=1.01:saturation=0.92,colorbalance=rs=-0.020:bs=0.020", reason: "Scene 1 warm crop transition" },
  { start: 2317, end: 2479, filter: "eq=brightness=-0.012:contrast=1.01:saturation=0.91,colorbalance=rs=-0.040:bs=0.040", reason: "Scene 1 over-warm wheat insert" },
  { start: 2479, end: 2647, filter: "eq=brightness=0.030:contrast=1.01:saturation=0.96,colorbalance=rs=0.014:bs=-0.014", reason: "Scene 1 wheat return" },
  { start: 4144, end: 4336, filter: "eq=brightness=-0.030:contrast=1.01:saturation=0.95,colorbalance=rs=0.018:bs=-0.018", reason: "Scene 3 bright private-teaching outlier" },
  { start: 8316, end: 8340, filter: "eq=brightness=0.035:contrast=1.01:saturation=0.95,colorbalance=rs=-0.025:bs=0.025", reason: "Scene 5 cool shore performance lead-in" },
  { start: 8620, end: 8680, filter: "eq=brightness=-0.035:contrast=1.01:saturation=0.92,colorbalance=rs=-0.025:bs=0.025", reason: "Scene 5 over-warm field insert" },
  { start: 9888, end: 9918, filter: "eq=brightness=0.025:contrast=1.01:saturation=0.95,colorbalance=rs=0.012:bs=-0.012", reason: "Scene 6 dark mustard transition" },
  { start: 10494, end: 10727, filter: "eq=brightness=0.020:contrast=1.01:saturation=0.94,colorbalance=rs=0.020:bs=-0.020", reason: "Departure dusk bridge match" }
];

// The final dawn handoff is intentionally brighter and warmer than the night
// calm, so it is excluded rather than falsely "matching" it to storm footage.
for (let index = 1; index < patches.length; index += 1) {
  const previous = patches[index - 1];
  const current = patches[index];
  if (!previous || !current) throw new Error("Invalid colour-match range index.");
  if (previous.end > current.start) throw new Error("Overlapping colour-match ranges.");
}

const data = getDataDir();
const assets = join(data, "assets");
const input = join(assets, inputRel);
const output = join(assets, outputRel);
if (!existsSync(input)) throw new Error("Missing held v62 input.");

let cursor = 0;
const parts: string[] = [];
const labels: string[] = [];
for (const [index, patch] of patches.entries()) {
  if (cursor < patch.start) {
    const label = `plain${index}`;
    parts.push(`[0:v]trim=start_frame=${cursor}:end_frame=${patch.start},setpts=PTS-STARTPTS,setsar=1[${label}]`);
    labels.push(`[${label}]`);
  }
  const label = `grade${index}`;
  parts.push(`[0:v]trim=start_frame=${patch.start}:end_frame=${patch.end},setpts=PTS-STARTPTS,${patch.filter},setsar=1[${label}]`);
  labels.push(`[${label}]`);
  cursor = patch.end;
}
if (cursor < total) {
  parts.push(`[0:v]trim=start_frame=${cursor}:end_frame=${total},setpts=PTS-STARTPTS,setsar=1[tail]`);
  labels.push("[tail]");
}
parts.push(`${labels.join("")}concat=n=${labels.length}:v=1:a=0[v]`);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-filter_complex", parts.join(";"), "-map", "[v]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output], { stdio: "inherit" });
const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
if (frames !== total) throw new Error(`Expected ${total} frames, got ${frames}.`);

const db = getDb();
const id = randomUUID();
const now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id, projectId, outputRel, Math.round(total / fps * 1000), 114, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id, JSON.stringify({ heldForReview: true, pictureBase: inputRel, selectiveSceneColourMatch: patches }), JSON.stringify({ audioBase: inputRel, sourceCastAudioCopied: true }));
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
console.log(JSON.stringify({ outputRel, frames, heldForReview: true, patches }, null, 2));
