/**
 * Apply the exact, no-new-generation corrections that begin the v34 aesthetic
 * review.  The final cut stays at its shared 24-fps decoded-frame clock and
 * keeps the established source/cast mix byte-for-byte unchanged.
 *
 * This deliberately does not call generic mouth movement a performance:
 * three documented unsynchronised Jesus views become listener/wide coverage.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const assets = join(getDataDir(), "assets");
const fps = 24, totalFrames = 13231;
const baseRel = "generated/chapter/mark4-autonomous-overnight-final-v34-v30-opening-lipsync-frame-locked.mp4";
const listenerOneRel = "generated/assembled/6628e1e9-47ee-42de-b7b9-e3f578847c5b.mp4";
const listenerTwoRel = "generated/assembled/0003976f-7c1a-4508-a40c-cad61cd7bb37.mp4";
const listenerThreeRel = "generated/assembled/c84b12da-2581-4e08-8bcc-513e41b6b79b.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v35-aesthetic-first-pass-frame-locked.mp4";

const required = [baseRel, listenerOneRel, listenerTwoRel, listenerThreeRel];
for (const rel of required) if (!existsSync(join(assets, rel))) throw new Error(`Missing approved coverage: ${rel}`);

type Part = { input: number; start: number; end: number; label: string; normalize?: boolean };
const parts: Part[] = [
  { input: 0, start: 0, end: 7062, label: "preserved-through-Mark-4-21" },
  // #50 and #51: visible mouth movement did not match the continuing Jesus
  // source line.  The selected material depicts listeners, whose mouths are
  // not being read as the speaker.
  { input: 1, start: 0, end: 192, label: "Mark-4-21-listener-cover-A", normalize: true },
  { input: 2, start: 0, end: 192, label: "Mark-4-21-listener-cover-B", normalize: true },
  { input: 0, start: 7446, end: 9066, label: "preserved-between-cover-revisions" },
  // #63: the same defect just before the approved mustard illustration.
  { input: 3, start: 0, end: 82, label: "Mark-4-30-listener-cover", normalize: true },
  { input: 0, start: 9148, end: 9786, label: "preserved-mustard-illustration" },
  // #68: three-frame clip-art mustard-tree intrusion.  Continue the prior
  // natural tree image rather than inserting a new visual event.
  { input: 0, start: 9783, end: 9786, label: "natural-mustard-tree-continuation" },
  { input: 0, start: 9789, end: 12654, label: "preserved-to-storm-calm" },
  // #92: 14 daytime olive-grove frames inside the moonlit boat sequence.
  // Extend preceding moonlit boat coverage for this exact span.
  { input: 0, start: 12640, end: 12654, label: "moonlit-boat-continuation" },
  { input: 0, start: 12668, end: totalFrames, label: "preserved-ending" }
];
const outputFrames = parts.reduce((sum, part) => sum + part.end - part.start, 0);
if (outputFrames !== totalFrames) throw new Error(`Picture plan drifted to ${outputFrames} frames.`);

const filters = parts.map((part, index) => {
  const normalize = part.normalize
    ? `fps=${fps},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,`
    : "";
  return `[${part.input}:v]${normalize}trim=start_frame=${part.start}:end_frame=${part.end},setpts=PTS-STARTPTS[p${index}]`;
});
filters.push(`${parts.map((_, index) => `[p${index}]`).join("")}concat=n=${parts.length}:v=1:a=0[video]`);

const output = join(assets, outputRel);
execFileSync("ffmpeg", [
  "-v", "error", "-y",
  "-i", join(assets, baseRel),
  "-i", join(assets, listenerOneRel),
  "-i", join(assets, listenerTwoRel),
  "-i", join(assets, listenerThreeRel),
  "-filter_complex", filters.join(";"),
  "-map", "[video]", "-map", "0:a:0",
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
  "-c:a", "copy", "-movflags", "+faststart", output
], { stdio: "inherit" });

const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
const audioHash = (path: string) => createHash("md5").update(execFileSync("ffmpeg", ["-v", "error", "-i", path, "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"], { encoding: "buffer" })).digest("hex");
if (frames !== totalFrames) throw new Error(`Frame lock failed: ${frames} frames.`);
if (audioHash(join(assets, baseRel)) !== audioHash(output)) throw new Error("Picture-only edit unexpectedly changed audio.");

const db = getDb(), renderId = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(renderId, projectId, outputRel, Math.round(totalFrames / fps * 1000), parts.length, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(
    renderId,
    JSON.stringify({ pictureBase: baseRel, revisions: parts.map(({ label, start, end }) => ({ label, startFrame: start, endFrameExclusive: end })) }),
    JSON.stringify({ audioUnchangedFrom: baseRel, rule: "Generic mouth movement is not source-bound lip-sync; listener/wide coverage only under continuing Jesus speech." })
  );
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }

console.log(JSON.stringify({ outputRel, frames, audioMd5: audioHash(output), revisions: parts.filter(part => part.input !== 0 || part.label.includes("continuation")) }, null, 2));
