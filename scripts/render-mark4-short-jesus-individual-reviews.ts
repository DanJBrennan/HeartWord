/** Render exact-duration, exact-audio files for reviewing the seven independent
 * Mark 4 Jesus performances. This is a local review presentation only. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

type Item = { key: string; shotId: string; label: string; sourceId: string; startMs: number; endMs: number };
const dataDir = getDataDir(); const db = getDb();
const manifest = JSON.parse(readFileSync(join(dataDir, "assets", "generated", "pilot-source", "mark4-short-jesus-batch.json"), "utf8")) as { items: Item[] };
if (manifest.items.length !== 7) throw Error("The held short-Jesus batch must have seven items.");
const relDir = join("generated", "chapter", "mark4-short-jesus-review-clips");
mkdirSync(join(dataDir, "assets", relDir), { recursive: true });
for (const item of manifest.items) {
  const video = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='lip_sync'
    AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1`).get(item.shotId, `Mark 4 short-Jesus batch ${item.key}%`) as { result_asset_path: string } | undefined;
  const audio = db.prepare(`SELECT composite.source_path FROM composite_audio_source_map map
    JOIN audio_segments composite ON composite.id=map.composite_segment_id AND composite.layer='composite_cast_master'
    WHERE map.original_segment_id=?`).get(item.sourceId) as { source_path: string } | undefined;
  if (!video || !audio || !existsSync(join(dataDir, "assets", video.result_asset_path)) || !existsSync(join(dataDir, "assets", audio.source_path))) {
    throw Error(`Held media is unavailable for ${item.label}.`);
  }
  const duration = (item.endMs - item.startMs) / 1000;
  const rel = join(relDir, `${item.key}.mp4`); const output = join(dataDir, "assets", rel);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(dataDir, "assets", video.result_asset_path), "-i", join(dataDir, "assets", audio.source_path),
    "-filter_complex", `[0:v]trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[v];[1:a]atrim=duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS[a]`,
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output], { stdio: ["ignore", "ignore", "pipe"] });
  const actual = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", output], { encoding: "utf8" }).trim());
  if (Math.abs(actual - duration) > 0.1) throw Error(`${item.label} review duration drifted to ${actual}s.`);
  console.log(`${item.key}: ${actual.toFixed(3)}s`);
}
