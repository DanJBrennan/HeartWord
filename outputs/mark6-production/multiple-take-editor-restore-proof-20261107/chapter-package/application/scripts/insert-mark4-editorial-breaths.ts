/**
 * Produce a held Mark 4 editorial-breath candidate.
 *
 * The source/cast recording is never stretched or rephrased: each breath is
 * an explicitly recorded silence and same-shot picture hold placed after a
 * completed source interval.  Later frame-review mappings must read the
 * manifest's offset entries rather than infer source time from final time.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const fps = 24;
const baseRel = "generated/chapter/mark4-autonomous-overnight-final-v37-verse12-speaker-audio-held.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v38-editorial-breaths-held.mp4";
const totalBaseFrames = 13231;
const breaths = [
  { boundary: 3034, frames: 24, after: "Mark 4:9", sourceEndMs: 114896, treatment: "shore audience absorbs the closing call" },
  { boundary: 6484, frames: 24, after: "Mark 4:20", sourceEndMs: 258679, treatment: "private-hillside listener reaction" },
  { boundary: 7639, frames: 24, after: "Mark 4:25", sourceEndMs: 306801, treatment: "shore listener and lake detail" },
  { boundary: 8874, frames: 30, after: "Mark 4:29", sourceEndMs: 358269, treatment: "field harvest detail" },
  { boundary: 9786, frames: 30, after: "Mark 4:32", sourceEndMs: 396232, treatment: "mustard branches and nesting-bird resolution" },
  { boundary: 10461, frames: 36, after: "pre-Mark 4:35 departure", sourceEndMs: 424373, treatment: "dusk lake and boat-ready transition" },
  { boundary: 12001, frames: 48, after: "Mark 4:39 Jesus command", sourceEndMs: 488521, treatment: "calm-water reaction after Peace, be still" }
] as const;

const data = getDataDir(), assets = join(data, "assets"), base = join(assets, baseRel), output = join(assets, outputRel);
if (!existsSync(base)) throw new Error(`Missing held v37 input: ${baseRel}`);
if (breaths.some((item, index) => item.boundary <= (index ? breaths[index - 1]!.boundary : 0) || item.boundary >= totalBaseFrames)) throw new Error("Editorial breath boundaries must be increasing and inside the source picture.");

const filters: string[] = [];
const videoParts: string[] = [], audioParts: string[] = [];
let cursor = 0, part = 0;
for (const breath of breaths) {
  filters.push(`[0:v]trim=start_frame=${cursor}:end_frame=${breath.boundary},setpts=PTS-STARTPTS[v${part}]`);
  filters.push(`[0:a]atrim=start=${(cursor / fps).toFixed(6)}:end=${(breath.boundary / fps).toFixed(6)},asetpts=PTS-STARTPTS[a${part}]`);
  videoParts.push(`[v${part}]`); audioParts.push(`[a${part++}]`);
  const duration = breath.frames / fps;
  // A held final decoded image makes the pause a deliberate punctuation mark,
  // not a new scene, cutaway, or synthetic performance.
  filters.push(`[0:v]trim=start_frame=${breath.boundary - 1}:end_frame=${breath.boundary},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${duration.toFixed(6)},fps=${fps},trim=duration=${duration.toFixed(6)},setpts=PTS-STARTPTS[v${part}]`);
  filters.push(`anullsrc=r=44100:cl=stereo:d=${duration.toFixed(6)}[a${part}]`);
  videoParts.push(`[v${part}]`); audioParts.push(`[a${part++}]`);
  cursor = breath.boundary;
}
filters.push(`[0:v]trim=start_frame=${cursor}:end_frame=${totalBaseFrames},setpts=PTS-STARTPTS[v${part}]`);
filters.push(`[0:a]atrim=start=${(cursor / fps).toFixed(6)},asetpts=PTS-STARTPTS[a${part}]`);
videoParts.push(`[v${part}]`); audioParts.push(`[a${part}]`);
filters.push(`${videoParts.join("")}concat=n=${videoParts.length}:v=1:a=0[video]`);
filters.push(`${audioParts.join("")}concat=n=${audioParts.length}:v=0:a=1[audio]`);

execFileSync("ffmpeg", ["-v", "error", "-y", "-i", base, "-filter_complex", filters.join(";"), "-map", "[video]", "-map", "[audio]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output], { stdio: "inherit" });

const expectedFrames = totalBaseFrames + breaths.reduce((sum, item) => sum + item.frames, 0);
const actualFrames = Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
if (actualFrames !== expectedFrames) throw new Error(`Frame count mismatch: expected ${expectedFrames}, got ${actualFrames}.`);

let addedFrames = 0;
const editorialBreaths = breaths.map(item => {
  const startFrame = item.boundary + addedFrames;
  addedFrames += item.frames;
  return { ...item, startFrame, endFrame: startFrame + item.frames - 1, filmStartMs: Math.round(startFrame / fps * 1000), filmEndMs: Math.round((startFrame + item.frames) / fps * 1000) };
});
const db = getDb(), id = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outputRel, Math.round(expectedFrames / fps * 1000), breaths.length * 2 + 1, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(id,
      JSON.stringify({ pictureBase: baseRel, editorialBreaths, rule: "Explicit same-world picture holds with no source speech." }),
      JSON.stringify({ audioBase: baseRel, sourceCastRule: "All base source/cast spans remain unchanged; exact silence is inserted only for listed editorial breaths.", editorialBreaths }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, expectedFrames, editorialBreaths }, null, 2));
