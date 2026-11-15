/**
 * Held v45: place only producer-approved canonical Jesus performances into
 * the v44 picture. Source/cast audio is copied unchanged; the chapter clock
 * remains exactly 13,447 decoded frames. No timeline promotion occurs.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

type ManifestItem = { key: string; shotId: string; passage: string; startMs: number; endMs: number };
type Piece = { path: string; start: number; frames: number; label: string };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const fps = 24, totalFrames = 13447;
const baseRel = "generated/chapter/mark4-autonomous-overnight-final-v44-audible-ambient-phrase-led-held.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v45-canonical-jesus-performances-held.mp4";
const breaths = [[3034, 3057], [6508, 6531], [7687, 7710], [8946, 8975], [9888, 9917], [10593, 10628], [12169, 12216]] as const;
const data = getDataDir(), assets = join(data, "assets"), base = join(assets, baseRel), output = join(assets, outputRel);
if (!existsSync(base)) throw new Error(`Missing v44 held cut: ${baseRel}`);
const manifest = JSON.parse(readFileSync(join(assets, "generated/pilot-source/mark4-v34-canonical-performances/manifest.json"), "utf8")) as { prepared: ManifestItem[] };
if (manifest.prepared.length !== 15) throw new Error("Expected exactly 15 approved canonical performance intervals.");
const db = getDb();

const insertedBefore = (frame: number) => breaths.filter(([, end]) => end < frame).reduce((sum, [start, end]) => sum + end - start + 1, 0);
const sourceToFinalFrame = (sourceMs: number) => {
  let frame = Math.round((sourceMs / 1000 + 11.5) * fps);
  for (let pass = 0; pass < 3; pass += 1) frame = Math.round((sourceMs / 1000 + 11.5) * fps) + insertedBefore(frame);
  return frame;
};
const videoFor = (item: ManifestItem) => {
  const row = db.prepare(`SELECT result_asset_path,operation FROM generation_attempts
    WHERE shot_id=? AND status='accepted' AND operation IN ('canonical_v34_lip_sync','canonical_v34_close_lip_sync')
    ORDER BY created_at DESC LIMIT 1`).get(item.shotId) as { result_asset_path: string; operation: string } | undefined;
  if (!row || !existsSync(join(assets, row.result_asset_path))) throw new Error(`${item.key} has no accepted retained performance.`);
  return row;
};
const performances = manifest.prepared.map((item) => {
  const video = videoFor(item);
  const start = sourceToFinalFrame(item.startMs);
  const frames = Math.round((item.endMs - item.startMs) / 1000 * fps);
  if (frames < 1 || start < 0 || start + frames > totalFrames) throw new Error(`${item.key} maps outside the held chapter clock.`);
  if (breaths.some(([breathStart, breathEnd]) => start <= breathEnd && start + frames - 1 >= breathStart)) throw new Error(`${item.key} would overlap an editorial breath.`);
  return { ...item, ...video, start, frames };
}).sort((a, b) => a.start - b.start);
for (const [index, item] of performances.entries()) if (index && item.start < performances[index - 1]!.start + performances[index - 1]!.frames) throw new Error(`Approved performance intervals overlap at ${item.key}.`);

const pieces: Piece[] = [];
let cursor = 0;
for (const item of performances) {
  if (item.start > cursor) pieces.push({ path: baseRel, start: cursor, frames: item.start - cursor, label: "v44 retained picture" });
  pieces.push({ path: item.result_asset_path, start: 0, frames: item.frames, label: `${item.passage} ${item.key} approved canonical Jesus performance (${item.operation})` });
  cursor = item.start + item.frames;
}
if (cursor < totalFrames) pieces.push({ path: baseRel, start: cursor, frames: totalFrames - cursor, label: "v44 retained picture" });
if (pieces.reduce((sum, piece) => sum + piece.frames, 0) !== totalFrames) throw new Error("Performance assembly broke the chapter frame clock.");

const paths = [...new Set(pieces.map((piece) => piece.path))];
const index = new Map(paths.map((path, number) => [path, number]));
const filters = pieces.map((piece, number) => `[${index.get(piece.path)!}:v]fps=${fps},trim=start_frame=${piece.start}:end_frame=${piece.start + piece.frames},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,setpts=PTS-STARTPTS[p${number}]`);
filters.push(`${pieces.map((_, number) => `[p${number}]`).join("")}concat=n=${pieces.length}:v=1:a=0[video]`);
execFileSync("ffmpeg", ["-v", "error", "-y", ...paths.flatMap((path) => ["-i", join(assets, path)]), "-filter_complex", filters.join(";"), "-map", "[video]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output], { stdio: "inherit" });

const frameCount = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
const audioHash = (path: string) => createHash("md5").update(execFileSync("ffmpeg", ["-v", "error", "-i", path, "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"], { encoding: "buffer" })).digest("hex");
if (frameCount !== totalFrames) throw new Error(`Frame-lock failure: expected ${totalFrames}, got ${frameCount}.`);
if (audioHash(base) !== audioHash(output)) throw new Error("Performance placement changed the approved v44 audio stream.");

const now = Date.now(), renderId = randomUUID();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(renderId, projectId, outputRel, Math.round(totalFrames / fps * 1000), pieces.length, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(renderId, JSON.stringify({ pictureBase: baseRel, heldForReview: true, approvedPerformancePlacements: performances.map(({ key, passage, startMs, endMs, start, frames, result_asset_path, operation }) => ({ key, passage, sourceStartMs: startMs, sourceEndMs: endMs, finalStartFrame: start, finalEndFrame: start + frames - 1, frames, asset: result_asset_path, operation })), pieces }), JSON.stringify({ audioUnchangedFrom: baseRel, sourceCastAudioUnchanged: true }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, frameCount, audioMd5: audioHash(output), placements: performances.map(({ key, start, frames }) => ({ key, startFrame: start, endFrame: start + frames - 1 })), heldForReview: true }, null, 2));
