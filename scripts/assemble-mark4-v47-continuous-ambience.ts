/**
 * Held v47, Group 2 of the fixed v45 scorecard.
 *
 * It retains the complete v46 program (Hatam narration and cast speech) as
 * the foreground track and adds only low-level, scene-specific ambience.
 * Nothing is inserted over or substituted for source wording.  The delivery
 * stream is deliberately 48 kHz AAC, the project export standard.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

type Bed = { name: string; asset: string; start: number; end: number; volumeDb: number };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const fps = 24, totalFrames = 13447, duration = totalFrames / fps;
const inputRel = "generated/chapter/mark4-autonomous-overnight-final-v46-group1-picture-fixes-held.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v51-calibrated-ambience-48k-held.mp4";
const ambience = "generated/editorial/mark4-breath-ambience";
const beds: Bed[] = [
  // These source ambience masters already measure around -40 dBFS RMS; using
  // their natural level puts them at the scorecard target under speech.
  { name: "rocky shore and boat", asset: `${ambience}/shore-v1.mp3`, start: 0, end: 126.4, volumeDb: 0 },
  { name: "hillside and olive-grove teaching", asset: `${ambience}/olive-grove-v2-v1.mp3`, start: 124.9, end: 271.3, volumeDb: 0 },
  { name: "lakeshore teaching", asset: `${ambience}/shore-v1.mp3`, start: 269.8, end: 335.3, volumeDb: 0 },
  { name: "parable illustrations", asset: `${ambience}/field-v1.mp3`, start: 333.8, end: 438.0, volumeDb: -20 },
  { name: "dusk shore departure", asset: `${ambience}/dusk-lake-v1.mp3`, start: 436.5, end: 506.0, volumeDb: -20 },
  { name: "storm and great calm", asset: `${ambience}/storm-to-calm-v1.mp3`, start: 504.5, end: duration, volumeDb: 0 }
];
const breaths = [
  { start: 3034, frames: 24, boostDb: 5 }, { start: 6508, frames: 24, boostDb: 5 }, { start: 7687, frames: 24, boostDb: 5 },
  { start: 8946, frames: 30, boostDb: 14 }, { start: 9888, frames: 30, boostDb: 5 }, { start: 10593, frames: 36, boostDb: -2 },
  { start: 12169, frames: 48, boostDb: 5 }
];
const data = getDataDir(), assets = join(data, "assets"), input = join(assets, inputRel), output = join(assets, outputRel);
if (!existsSync(input)) throw new Error(`Missing v46 input: ${inputRel}`);
for (const bed of beds) if (!existsSync(join(assets, bed.asset))) throw new Error(`Missing approved ambience: ${bed.asset}`);

const unique = [...new Set(beds.map(bed => bed.asset))];
const assetIndex = new Map(unique.map((asset, index) => [asset, index + 1]));
const filters = ["[0:a]aresample=48000,aformat=channel_layouts=stereo[program]"];
for (const [index, bed] of beds.entries()) {
  const seconds = bed.end - bed.start, fade = Math.min(1.5, seconds / 4);
  filters.push(`[${assetIndex.get(bed.asset)!}:a]atrim=duration=${seconds.toFixed(6)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${bed.volumeDb}dB,afade=t=in:st=0:d=${fade},afade=t=out:st=${(seconds - fade).toFixed(3)}:d=${fade},adelay=${Math.round(bed.start * 1000)}:all=1[bed${index}]`);
}
// Editorial breaths should register as living places, not digital silence.
// A modest +5 dB overlay only occurs in declared no-Scripture breath frames.
for (const [index, breath] of breaths.entries()) {
  const bed = beds.find(item => breath.start / fps >= item.start && breath.start / fps < item.end)!;
  const seconds = breath.frames / fps, start = breath.start / fps, fade = Math.min(0.16, seconds / 3);
  filters.push(`[${assetIndex.get(bed.asset)!}:a]atrim=duration=${seconds.toFixed(6)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${bed.volumeDb + breath.boostDb}dB,afade=t=in:st=0:d=${fade},afade=t=out:st=${(seconds-fade).toFixed(3)}:d=${fade},adelay=${Math.round(start * 1000)}:all=1[breath${index}]`);
}
filters.push(`[program]${beds.map((_, i) => `[bed${i}]`).join("")}${breaths.map((_, i) => `[breath${i}]`).join("")}amix=inputs=${1+beds.length+breaths.length}:duration=first:normalize=0,alimiter=limit=0.89:level=false[mix]`);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, ...unique.flatMap(asset => ["-stream_loop", "-1", "-i", join(assets, asset)]), "-filter_complex", filters.join(";"), "-map", "0:v:0", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k", "-movflags", "+faststart", output], { stdio: "inherit" });
const frameCount = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
const rate = Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
if (frameCount !== totalFrames) throw new Error(`Frame-lock failure: expected ${totalFrames}, got ${frameCount}.`);
if (rate !== 48000) throw new Error(`Delivery audio must be 48 kHz, got ${rate}.`);
const now = Date.now(), id = randomUUID(), db = getDb();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id, projectId, outputRel, Math.round(duration*1000), 124, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id, JSON.stringify({ heldForReview:true, pictureFrom:inputRel, frameLocked:true }), JSON.stringify({ foregroundProgram:inputRel, sourceAndCastSpeechPreserved:true, outputSampleRateHz:48000, continuousBeds:beds, elevatedBreaths:breaths }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, frameCount, rate, heldForReview:true, beds }, null, 2));
