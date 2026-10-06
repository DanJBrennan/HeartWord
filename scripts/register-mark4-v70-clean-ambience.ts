/** Register the held v70 render (built by Claude in a Cowork session while Codex
 * was unavailable). The render itself was produced outside this repo's scripts by
 * HeartWordData/scratch/claude-takeover/patchtool.py, v68tool.py, v69tool.py and v70tool.py; this script only records it
 * in the database with its manifest, the same way earlier held cuts were recorded.
 * Run on Dan's machine:  npx tsx scripts/register-mark4-v70-clean-ambience.ts */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0", total = 13903;
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v70-clean-ambience-held.mp4";
const data = getDataDir(), output = join(data, "assets", outputRel);
const manifestPath = join(data, "scratch", "claude-takeover", "v70-render-manifest.json");
if (!existsSync(output) || !existsSync(manifestPath)) throw new Error("Missing v70 render or its manifest.");
const frames = Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
if (frames !== total) throw new Error(`Expected ${total} frames, got ${frames}.`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const db = getDb(), id = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id, projectId, outputRel, 579292, 116, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id, JSON.stringify(manifest), JSON.stringify({ audioBase: manifest.pictureBase, sourceCastAudioCopied: false, audioRepair: manifest.audio }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, frames, heldForReview: true, renderId: id }, null, 2));
