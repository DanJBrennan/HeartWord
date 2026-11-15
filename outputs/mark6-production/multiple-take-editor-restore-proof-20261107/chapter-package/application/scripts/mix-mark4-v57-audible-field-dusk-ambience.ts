/** Held v57: restore the natural field and dusk ambience level that v51
 * mistakenly attenuated by 20 dB. Picture and program speech are copied; the
 * only change is an extra, scene-local natural ambience layer. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const inputRel = "generated/chapter/mark4-autonomous-overnight-final-v55-scene-grade-held.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v57-audible-scene-ambience-held.mp4";
const data = getDataDir(), assets = join(data, "assets"), input = join(assets, inputRel), output = join(assets, outputRel);
const overlays = [
  { name: "open-field wind", asset: "generated/editorial/mark4-breath-ambience/field-v1.mp3", start: 333.8, end: 438.0 },
  { name: "dusk-lake water", asset: "generated/editorial/mark4-breath-ambience/dusk-lake-v1.mp3", start: 436.5, end: 506.0 }
];
if (!existsSync(input)) throw new Error(`Missing v55 held cut: ${inputRel}`);
for (const overlay of overlays) if (!existsSync(join(assets, overlay.asset))) throw new Error(`Missing ambience ${overlay.asset}`);
const filters = ["[0:a]aresample=48000,aformat=channel_layouts=stereo[program]"];
for (const [i, overlay] of overlays.entries()) {
  const duration = overlay.end - overlay.start, fade = 1.5;
  filters.push(`[${i + 1}:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=${fade},afade=t=out:st=${(duration-fade).toFixed(3)}:d=${fade},adelay=${Math.round(overlay.start*1000)}:all=1[bed${i}]`);
}
filters.push(`[program]${overlays.map((_, i) => `[bed${i}]`).join("")}amix=inputs=${overlays.length+1}:duration=first:normalize=0,alimiter=limit=0.89:level=false,volume=-0.2dB[mix]`);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, ...overlays.flatMap(overlay => ["-stream_loop", "-1", "-i", join(assets, overlay.asset)]), "-filter_complex", filters.join(";"), "-map", "0:v:0", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k", "-movflags", "+faststart", output], { stdio: "inherit" });
const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
if (Math.abs(duration - 576.291667) > 0.02) throw new Error(`Audio mix changed duration to ${duration}.`);
const rate = Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
if (rate !== 48000) throw new Error(`Delivery must be 48 kHz, got ${rate}.`);
const db = getDb(), id = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id, projectId, outputRel, Math.round(duration*1000), 115, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id, JSON.stringify({ heldForReview: true, pictureBase: inputRel }), JSON.stringify({ programBase: inputRel, sourceCastSpeechPreserved: true, restoredNaturalAmbience: overlays, outputSampleRateHz: 48000 }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, rate, heldForReview: true }, null, 2));
