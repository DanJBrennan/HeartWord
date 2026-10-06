/**
 * Held v42 correction for Mark 4's editorial breaths.
 *
 * Source and cast speech are never cut, stretched, replaced, or mixed over:
 * ambience is inserted only in the seven already-explicit no-Scripture
 * windows.  The storm command breath immediately reveals calm water.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

type Breath = { start: number; frames: number; asset: string; volume: number; label: string };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const fps = 24, totalFrames = 13447;
const pictureBaseRel = "generated/chapter/mark4-autonomous-overnight-final-v43-phrase-led-private-teaching-held.mp4";
const audioBaseRel = "generated/chapter/mark4-autonomous-overnight-final-v41-residual-picture-defects-held.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v44-audible-ambient-phrase-led-held.mp4";
const ambience = "generated/editorial/mark4-breath-ambience";
const calmWater = "generated/assembled/3af6de74-e66b-43ed-8e22-427119efd0ed.mp4";
const breaths: Breath[] = [
  { start: 3034, frames: 24, asset: `${ambience}/shore-v1.mp3`, volume: 0.28, label: "Mark 4:9 shore reflection" },
  { start: 6508, frames: 24, asset: `${ambience}/olive-grove-v2-v1.mp3`, volume: 0.65, label: "Mark 4:20 olive-grove reflection" },
  { start: 7687, frames: 24, asset: `${ambience}/shore-v1.mp3`, volume: 0.26, label: "Mark 4:25 lakeshore reflection" },
  { start: 8946, frames: 30, asset: `${ambience}/field-v1.mp3`, volume: 0.25, label: "Mark 4:29 field reflection" },
  { start: 9888, frames: 30, asset: `${ambience}/field-v1.mp3`, volume: 0.22, label: "Mark 4:32 mustard-field reflection" },
  { start: 10593, frames: 36, asset: `${ambience}/dusk-lake-v1.mp3`, volume: 0.28, label: "pre-crossing dusk-lake reflection" },
  { start: 12169, frames: 48, asset: `${ambience}/storm-to-calm-v1.mp3`, volume: 0.30, label: "Mark 4:39 storm-to-calm reflection" }
];
const data = getDataDir(), assets = join(data, "assets"), output = join(assets, outputRel);
for (const path of [pictureBaseRel, audioBaseRel, calmWater, ...breaths.map(item => item.asset)]) if (!existsSync(join(assets, path))) throw new Error(`Missing held-breath input: ${path}`);
if (breaths.some((item, index) => item.start < 0 || item.frames < 1 || item.start + item.frames > totalFrames || (index && item.start <= breaths[index - 1]!.start))) throw new Error("Breaths must be valid ordered final-frame intervals.");

// The original post-command storm material lasts another 120 frames after
// the pause. Replace that as one continuous calm-water run, so the picture
// never returns to lightning once the silence begins.
const calmStart = 12169, calmEndExclusive = 12337;
const pieces: Array<{ path: string; start: number; frames: number; label: string }> = [
  { path: pictureBaseRel, start: 0, frames: calmStart, label: "v43 before storm calm" },
  { path: calmWater, start: 0, frames: calmEndExclusive - calmStart, label: "immediate calm water after command" },
  { path: pictureBaseRel, start: calmEndExclusive, frames: totalFrames - calmEndExclusive, label: "v43 after storm calm" }
];
const paths = [...new Set(pieces.map(piece => piece.path))];
const input = new Map(paths.map((path, index) => [path, index]));
const videoFilters = pieces.map((piece, index) => `[${input.get(piece.path)!}:v]fps=${fps},trim=start_frame=${piece.start}:end_frame=${piece.start + piece.frames},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,setpts=PTS-STARTPTS[v${index}]`);
videoFilters.push(`${pieces.map((_, index) => `[v${index}]`).join("")}concat=n=${pieces.length}:v=1:a=0[video]`);

// The base audio remains the complete approved source/cast program.  Each
// delayed effect is truncated and faded inside a declared editorial breath;
// it cannot overlap a Scripture interval by construction.
const audioInputs = [audioBaseRel, ...breaths.map(item => item.asset)];
const audioBaseInput = paths.length;
const audioFilters = [`[${audioBaseInput}:a]asetpts=PTS-STARTPTS[program]`];
const firstAmbienceInput = audioBaseInput + 1;
for (const [index, item] of breaths.entries()) {
  const seconds = item.frames / fps, start = item.start / fps;
  const fade = Math.min(0.18, seconds / 3).toFixed(3);
  audioFilters.push(`[${firstAmbienceInput + index}:a]atrim=duration=${seconds.toFixed(6)},asetpts=PTS-STARTPTS,volume=${item.volume},afade=t=in:st=0:d=${fade},afade=t=out:st=${Math.max(0, seconds - Number(fade)).toFixed(3)}:d=${fade},adelay=${Math.round(start * 1000)}:all=1[a${index}]`);
}
audioFilters.push(`[program]${breaths.map((_, index) => `[a${index}]`).join("")}amix=inputs=${breaths.length + 1}:duration=first:normalize=0[audio]`);

execFileSync("ffmpeg", ["-v", "error", "-y", ...paths.flatMap(path => ["-i", join(assets, path)]), ...audioInputs.flatMap(path => ["-i", join(assets, path)]),
  "-filter_complex", [...videoFilters, ...audioFilters].join(";"), "-map", "[video]", "-map", "[audio]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "96000", "-b:a", "192k", "-movflags", "+faststart", output], { stdio: "inherit" });

const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
if (frames !== totalFrames) throw new Error(`Frame-lock failure: expected ${totalFrames}, received ${frames}.`);
if (Math.abs(duration - totalFrames / fps) > 0.15) throw new Error(`Duration changed: ${duration}.`);
const db = getDb(), id = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outputRel, Math.round(duration * 1000), pieces.length, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(id, JSON.stringify({ pictureBase: pictureBaseRel, heldForReview: true, calmWaterReplacement: [calmStart, calmEndExclusive - 1], editorialBreaths: breaths }),
      JSON.stringify({ audioBase: audioBaseRel, sourceCastAudioPreserved: true, ambienceOnlyDuringEditorialBreaths: breaths.map(({ start, frames, asset, label }) => ({ startFrame: start, endFrame: start + frames - 1, asset, label })) }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, frames, duration, heldForReview: true, breaths }, null, 2));
