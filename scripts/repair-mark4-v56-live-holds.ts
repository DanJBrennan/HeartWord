/** Held v56: replace the remaining near-frozen holds with a restrained push-in
 * over their own approved picture. No source wording, audio, duration, or
 * location changes. The push is deliberately modest (3–5%) so it reads as
 * camera life, not a fabricated character performance. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

type Piece = { start: number; frames: number; push?: boolean; label: string };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const fps = 24, total = 13831;
const inputRel = "generated/chapter/mark4-autonomous-overnight-final-v55-scene-grade-held.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v56-live-holds-held.mp4";
const data = getDataDir(), input = join(data, "assets", inputRel), output = join(data, "assets", outputRel);
if (!existsSync(input)) throw new Error(`Missing v55 held cut: ${inputRel}`);

// Exact v55 scorecard holds, decoded-frame clock at 24 fps.
const holds = [
  [4731, 139, "private-teaching listener hold"],
  [4870, 122, "private-teaching path hold"],
  [5100, 76, "private-teaching listener hold"],
  [5351, 121, "olive-grove listener hold"],
  [6128, 82, "olive-grove reflection hold"],
  [8045, 103, "shore performance-adjacent hold"],
  [10302, 192, "private-explanation group hold"]
] as const;

let cursor = 0;
const pieces: Piece[] = [];
for (const [start, frames, label] of holds) {
  if (start < cursor || start + frames > total) throw new Error(`Invalid hold ${label}.`);
  if (start > cursor) pieces.push({ start: cursor, frames: start - cursor, label: "retained picture" });
  pieces.push({ start, frames, push: true, label });
  cursor = start + frames;
}
if (cursor < total) pieces.push({ start: cursor, frames: total - cursor, label: "retained picture" });
if (pieces.reduce((sum, piece) => sum + piece.frames, 0) !== total) throw new Error("v56 plan changed frame clock.");

const filters = pieces.map((piece, i) => {
  const trim = `[0:v]trim=start_frame=${piece.start}:end_frame=${piece.start + piece.frames},setpts=PTS-STARTPTS,fps=${fps}`;
  // zoompan emits one output for each input frame; 0.00065/frame stays <=5%.
  return piece.push
    ? `${trim},zoompan=z='min(zoom+0.00065,1.05)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=1280x720:fps=${fps},trim=end_frame=${piece.frames},setpts=PTS-STARTPTS[p${i}]`
    : `${trim}[p${i}]`;
});
filters.push(`${pieces.map((_, i) => `[p${i}]`).join("")}concat=n=${pieces.length}:v=1:a=0[v]`);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-filter_complex", filters.join(";"), "-map", "[v]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output], { stdio: "inherit" });
const count = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
if (count !== total) throw new Error(`Expected ${total} frames, received ${count}.`);

const db = getDb(), now = Date.now(), id = randomUUID();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outputRel, Math.round(total / fps * 1000), pieces.length, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(id, JSON.stringify({ heldForReview: true, pictureBase: inputRel, repairs: holds.map(([start, frames, label]) => ({ startFrame: start, endFrame: start + frames - 1, label, method: "restrained 3–5% centre push" })) }), JSON.stringify({ audioBase: inputRel, copiedWithoutModification: true }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, count, heldForReview: true }, null, 2));
