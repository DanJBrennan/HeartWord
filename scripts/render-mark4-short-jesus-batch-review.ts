/** Assemble the seven independent, source-bound Jesus performances for review.
 * The reel is only a review artifact: no clips are placed on the chapter timeline. */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

type Item = { key: string; shotId: string; label: string; sourceId: string; startMs: number; endMs: number };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir(); const db = getDb();
const manifest = JSON.parse(readFileSync(join(dataDir, "assets", "generated", "pilot-source", "mark4-short-jesus-batch.json"), "utf8")) as { items: Item[] };
if (manifest.items.length !== 7) throw Error("The held short-Jesus batch must have seven items.");
const items = manifest.items.map(item => {
  const video = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='lip_sync'
    AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1`).get(item.shotId, `Mark 4 short-Jesus batch ${item.key}%`) as { result_asset_path: string } | undefined;
  const audio = db.prepare(`SELECT composite.source_path FROM composite_audio_source_map map
    JOIN audio_segments composite ON composite.id=map.composite_segment_id AND composite.layer='composite_cast_master'
    WHERE map.original_segment_id=?`).get(item.sourceId) as { source_path: string } | undefined;
  if (!video || !audio || !existsSync(join(dataDir, "assets", video.result_asset_path)) || !existsSync(join(dataDir, "assets", audio.source_path))) {
    throw Error(`Required held media is unavailable for ${item.label}.`);
  }
  return { ...item, video: video.result_asset_path, audio: audio.source_path, duration: (item.endMs - item.startMs) / 1000 };
});
const total = items.reduce((sum, item) => sum + item.duration, 0);
const rel = "generated/chapter/mark4-short-jesus-batch-review.mp4";
const output = join(dataDir, "assets", rel); mkdirSync(join(dataDir, "assets", "generated", "chapter"), { recursive: true });
if (existsSync(output)) throw new Error("Retained batch review exists; choose a new revision.");
const videoFilters = items.map((item, i) => `[${i}:v]trim=duration=${item.duration.toFixed(3)},setpts=PTS-STARTPTS,scale=1904:1072,setsar=1[v${i}]`);
const audioOffset = items.length;
const audioFilters = items.map((item, i) => `[${audioOffset + i}:a]atrim=duration=${item.duration.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
const concatInputs = items.flatMap((_, i) => `[v${i}][a${i}]`).join("");
const filter = [...videoFilters, ...audioFilters, `${concatInputs}concat=n=${items.length}:v=1:a=1[v][a]`].join(";");
execFileSync("ffmpeg", ["-v", "error", "-y", ...items.flatMap(item => ["-i", join(dataDir, "assets", item.video)]), ...items.flatMap(item => ["-i", join(dataDir, "assets", item.audio)]), "-filter_complex", filter, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output], { stdio: ["ignore", "ignore", "pipe"] });
const actual = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", output], { encoding: "utf8" }).trim());
if (Math.abs(actual - total) > 0.15) throw Error(`Review reel duration drifted to ${actual}s; expected ${total}s.`);
const id = randomUUID(); const now = Date.now();
db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
 VALUES (?,?,'local_ffmpeg','source-bound-seven-shot-review','assemble_coverage_pilot','1904x1072',?,'hold_for_review',?,?,?)`)
 .run(id, items[0]!.shotId, `Mark 4 short-Jesus batch review: seven exact source-bound performances (${items.map(item => item.key).join(", ")}); each clip ends at its approved source boundary; held review only, no chapter timeline selection.`, rel, 0, now);
console.log(JSON.stringify({ path: rel, durationSeconds: actual, clips: items.map(item => item.key) }, null, 2));
