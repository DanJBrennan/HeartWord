/** Held v46, Group 1 of the v45 scorecard: exact picture-only repairs using
 * retained approved media. It preserves the v45 13,447-frame clock and audio
 * stream while restoring missing performances, live breaths, and no-gen
 * continuity repairs. */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

type Piece = { path: string; start: number; frames: number; label: string };
type Replacement = Piece & { at: number };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const fps = 24, totalFrames = 13447;
const baseRel = "generated/chapter/mark4-autonomous-overnight-final-v45-canonical-jesus-performances-held.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v46-group1-picture-fixes-held.mp4";
const data = getDataDir(), assets = join(data, "assets"), base = join(assets, baseRel), output = join(assets, outputRel);
if (!existsSync(base)) throw new Error(`Missing v45 held cut: ${baseRel}`);

const v21Pilot = "generated/chapter/mark4-v21-two-clip-pilot-review.mp4";
const v26Performance = "generated/lipsync-face/933022447253717040.mp4";
const calmListener = "generated/assembled/ecf4edd8-49f3-4ee9-8b66-14817ed02548.mp4";
const shoreListener = "generated/assembled/0e77c34b-7548-462c-8a3c-0879c8104925.mp4";
const oliveListener = "generated/assembled/31139734-b0c9-4454-b04a-d8d378d20ed6.mp4";
const shoreReflection = "generated/assembled/c650fbc7-8697-4f1a-beec-2fc7470f5706.mp4";
const fieldMotion = "generated/assembled/0662b8a6-134b-43d4-918c-21d938c79a5c.mp4";
const mustardListener = "generated/assembled/cacd5540-4576-4a15-b2bd-708eb27a4f8b.mp4";
const duskShore = "generated/assembled/2c535588-4be0-4c0f-a6cc-47aa1fb5c186.mp4";
const oliveA = "generated/assembled/1df48c5d-55b4-43bc-872a-dde88846ef46.mp4";
const oliveB = "generated/assembled/b1b92c1b-dbc0-4534-8db3-e7a859f66c45.mp4";
const oliveC = "generated/assembled/6096a4f9-7032-440d-97c8-ee2d92f377d7.mp4";
const required = [v21Pilot, v26Performance, calmListener, shoreListener, oliveListener, shoreReflection, fieldMotion, mustardListener, duskShore, oliveA, oliveB, oliveC];
for (const path of required) if (!existsSync(join(assets, path))) throw new Error(`Required retained media is missing: ${path}`);

const replacements: Replacement[] = [
  // 1–2. Restore the two producer-approved performances dropped by v45.
  { at: 6624, path: v21Pilot, start: 0, frames: 202, label: "restored approved Mark 4:21 two-beat performance" },
  { at: 7908, path: v26Performance, start: 0, frames: 137, label: "restored approved Mark 4:26 opening performance" },
  // 3. Remove both reintroduced four-disciples-facing-camera tableau runs.
  { at: 12544, path: calmListener, start: 18, frames: 14, label: "storm listener continuation replaces brief returned tableau" },
  { at: 12616, path: calmListener, start: 0, frames: 120, label: "storm listener reaction replaces returned four-disciples tableau" },
  // 4. Replace every frozen editorial breath with motion in the established world.
  { at: 3034, path: shoreListener, start: 0, frames: 24, label: "live shore reflection replaces frozen Mark 4:9 breath" },
  { at: 6508, path: oliveListener, start: 0, frames: 24, label: "live olive-grove reflection replaces frozen Mark 4:20 breath" },
  { at: 7687, path: shoreReflection, start: 0, frames: 24, label: "live shore reflection replaces frozen Mark 4:25 breath" },
  { at: 8946, path: fieldMotion, start: 0, frames: 30, label: "live field illustration replaces frozen Mark 4:29 breath" },
  { at: 9888, path: mustardListener, start: 0, frames: 30, label: "live mustard listener reflection replaces frozen Mark 4:32 breath" },
  { at: 10593, path: duskShore, start: 0, frames: 36, label: "live dusk-shore reflection replaces frozen departure breath" },
  // 6. Remove documented meadow/grove duplicates without moving source audio.
  { at: 5351, path: oliveA, start: 24, frames: 121, label: "unused olive-grove coverage replaces repeated meadow group" },
  { at: 5580, path: oliveB, start: 18, frames: 60, label: "unused olive-grove coverage replaces repeated meadow listeners" },
  { at: 6305, path: oliveC, start: 12, frames: 96, label: "unused olive-grove coverage replaces repeated grove listeners" }
].sort((a, b) => a.at - b.at);
for (const [i, item] of replacements.entries()) {
  if (item.at < 0 || item.frames < 1 || item.at + item.frames > totalFrames) throw new Error(`Invalid replacement ${item.label}.`);
  if (i && item.at < replacements[i - 1]!.at + replacements[i - 1]!.frames) throw new Error(`Overlapping replacements around ${item.label}.`);
}

const pieces: Piece[] = [];
let cursor = 0;
for (const item of replacements) {
  if (item.at > cursor) pieces.push({ path: baseRel, start: cursor, frames: item.at - cursor, label: "v45 retained picture" });
  pieces.push({ path: item.path, start: item.start, frames: item.frames, label: item.label });
  cursor = item.at + item.frames;
}
if (cursor < totalFrames) pieces.push({ path: baseRel, start: cursor, frames: totalFrames - cursor, label: "v45 retained picture" });
if (pieces.reduce((sum, piece) => sum + piece.frames, 0) !== totalFrames) throw new Error("v46 picture plan changed the frame clock.");
const paths = [...new Set(pieces.map((piece) => piece.path))];
const index = new Map(paths.map((path, number) => [path, number]));
const filters = pieces.map((piece, number) => `[${index.get(piece.path)!}:v]fps=${fps},trim=start_frame=${piece.start}:end_frame=${piece.start + piece.frames},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,setpts=PTS-STARTPTS[p${number}]`);
filters.push(`${pieces.map((_, number) => `[p${number}]`).join("")}concat=n=${pieces.length}:v=1:a=0[video]`);
execFileSync("ffmpeg", ["-v", "error", "-y", ...paths.flatMap((path) => ["-i", join(assets, path)]), "-filter_complex", filters.join(";"), "-map", "[video]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output], { stdio: "inherit" });
const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
const audioHash = (path: string) => createHash("md5").update(execFileSync("ffmpeg", ["-v", "error", "-i", path, "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"], { encoding: "buffer" })).digest("hex");
if (frames !== totalFrames) throw new Error(`Expected ${totalFrames} frames, got ${frames}.`);
if (audioHash(base) !== audioHash(output)) throw new Error("v46 picture-only pass changed audio.");
const now = Date.now(), renderId = randomUUID(), db = getDb();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(renderId, projectId, outputRel, Math.round(totalFrames / fps * 1000), pieces.length, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(renderId, JSON.stringify({ pictureBase: baseRel, heldForReview: true, scorecardGroup: 1, replacements, pieces }), JSON.stringify({ audioUnchangedFrom: baseRel, sourceCastAudioUnchanged: true }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, frames, audioMd5: audioHash(output), heldForReview: true, replacements: replacements.map(({ at, frames, label }) => ({ startFrame: at, endFrame: at + frames - 1, label })) }, null, 2));
