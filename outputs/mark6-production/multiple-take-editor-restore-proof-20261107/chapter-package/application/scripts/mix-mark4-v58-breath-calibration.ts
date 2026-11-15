/** Held v58: calibrate only the two over-loud wordless breaths introduced by
 * v57's restored field/dusk beds. This does not alter narration or cast speech. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const inputRel = "generated/chapter/mark4-autonomous-overnight-final-v57-audible-scene-ambience-held.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v58-calibrated-ambience-held.mp4";
const data = getDataDir(), input = join(data, "assets", inputRel), output = join(data, "assets", outputRel);
if (!existsSync(input)) throw new Error(`Missing v57 held cut: ${inputRel}`);

// f9888–9917 = 412.000–413.250 sec; f10593–10628 = 441.375–442.875 sec.
// Both are documented wordless editorial breaths. The rest of the source track
// stays bit-for-bit as decoded by the v57 program, subject only to AAC rewrap.
const filter = "[0:a]volume='if(between(t,412,413.25),0.18,if(between(t,441.375,442.875),0.316,1))':eval=frame,alimiter=limit=0.89:level=false[mix]";
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-filter_complex", filter, "-map", "0:v:0", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k", "-movflags", "+faststart", output], { stdio: "inherit" });
const rate = Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
if (rate !== 48000) throw new Error(`Delivery must be 48 kHz, got ${rate}.`);
const db = getDb(), id = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id, projectId, outputRel, 576292, 115, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id, JSON.stringify({ heldForReview: true, pictureBase: inputRel }), JSON.stringify({ programBase: inputRel, sourceCastSpeechPreservedOutsideBreaths: true, attenuatedEditorialBreaths: [{ frames: [9888, 9917], gainDb: -14.9 }, { frames: [10593, 10628], gainDb: -10.0 }], outputSampleRateHz: 48000 }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, rate, heldForReview: true }, null, 2));
