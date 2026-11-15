/**
 * Producer-directed picture repair for the Mark 4 final cut.
 *
 * This removes two off-canon Jesus views in the late teaching material and
 * rebuilds the complete storm window from Scene 7's approved, setting-matched
 * coverage and the four approved storm performances. The source/cast audio,
 * chapter frame clock, and all material outside the inclusive repaired windows
 * remain unchanged.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

type Segment = { label: string; path: string; frames: number; sourceStart?: number };

const dataDir = getDataDir();
const assets = join(dataDir, "assets");
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const fps = 24;
const totalFrames = 13231;
const baseRel = "generated/chapter/mark4-autonomous-overnight-final-v32-thorn-flash-repair-frame-locked.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v33-canon-storm-repair-frame-locked.mp4";

// These boundaries are the zero-based decoded-frame boundaries used by the
// review page. The three late-teaching windows are replaced as one contiguous
// picture edit so no old off-canon asset remains at a seam.
const v30WrongStart = 9066;
const mustardStart = 9148;
const privateTeachingWrongStart = 10170;
const stormStart = 10461;
const stormEndExclusive = 12654;

const v30Performance = "generated/lipsync-face/933023771291295744.mp4";
const privateTeaching = "generated/assembled/5ed18ff0-cfc2-4971-bffc-7d89fc02a3ff.mp4";
const shoreLead = "generated/assembled/2c535588-4be0-4c0f-a6cc-47aa1fb5c186.mp4";

const storm: Segment[] = [
  { label: "shore setting", path: shoreLead, frames: 98 },
  { label: "Jesus directs the crossing", path: "generated/assembled/bd31a5e8-0a4b-4eac-bd58-5821bb4a3838.mp4", frames: 86 },
  { label: "disciples board", path: "generated/assembled/1dcadb9d-f26b-4862-8683-ffc9c529d8e1.mp4", frames: 86 },
  { label: "boats depart", path: "generated/assembled/758ae7b7-8a94-46c1-8f86-a7360d979f92.mp4", frames: 122 },
  { label: "storm squall", path: "generated/assembled/60c28de3-b880-43a8-a208-3e11fbf2c6a6.mp4", frames: 147 },
  { label: "waves break aboard", path: "generated/assembled/f3cbda35-bdd3-4dd6-ad02-2dcaae6a3d95.mp4", frames: 120 },
  { label: "water fills deck", path: "generated/assembled/0396a389-3961-4dee-b53a-06a5731244e9.mp4", frames: 136 },
  { label: "Jesus asleep", path: "generated/assembled/c73f71d3-64a6-48f2-967e-010e198b8d15.mp4", frames: 162 },
  { label: "disciples struggle", path: "generated/assembled/ce748f77-5e27-44b4-86ec-2069fe797347.mp4", frames: 192 },
  { label: "storm-deck continuation", path: "generated/assembled/f3cbda35-bdd3-4dd6-ad02-2dcaae6a3d95.mp4", frames: 42, sourceStart: 120 },
  { label: "Peter plea", path: "generated/lipsync-face/932974602278539315.mp4", frames: 76 },
  { label: "Jesus rises", path: "generated/assembled/d7cf6a81-3dc8-497c-8b33-9c57bbcc1d67.mp4", frames: 120 },
  { label: "storm holds", path: "generated/assembled/60c28de3-b880-43a8-a208-3e11fbf2c6a6.mp4", frames: 124, sourceStart: 48 },
  { label: "Jesus command", path: "generated/lipsync-face/932975424261459971.mp4", frames: 47 },
  { label: "wind and waves calm", path: "generated/assembled/b631cdf5-748c-4b70-901f-8f8501749163.mp4", frames: 120 },
  { label: "calm lake", path: "generated/assembled/3af6de74-e66b-43ed-8e22-427119efd0ed.mp4", frames: 139 },
  { label: "Jesus question first beat", path: "generated/lipsync-face/mark4-storm-speech-end-trim-5352a79b-d8bc-4204-93b1-a8739c29be9e.mp4", frames: 50 },
  { label: "disciples listen", path: "generated/assembled/ecf4edd8-49f3-4ee9-8b66-14817ed02548.mp4", frames: 14 },
  { label: "Jesus question second beat", path: "generated/lipsync-face/mark4-storm-speech-end-trim-0946e0d0-0dcf-4991-996e-f561a9dd9105.mp4", frames: 58 },
  { label: "disciples in awe", path: "generated/assembled/ecf4edd8-49f3-4ee9-8b66-14817ed02548.mp4", frames: 120, sourceStart: 48 },
  { label: "calm-water awe", path: "generated/assembled/0a8f900e-14c3-4490-b27b-f78ef2429292.mp4", frames: 134 }
];

const stormFrames = storm.reduce((sum, segment) => sum + segment.frames, 0);
if (stormFrames !== stormEndExclusive - stormStart) {
  throw new Error(`Storm plan is ${stormFrames} frames; expected ${stormEndExclusive - stormStart}.`);
}

const required = [baseRel, v30Performance, privateTeaching, shoreLead, ...storm.map(segment => segment.path)];
for (const path of required) if (!existsSync(join(assets, path))) throw new Error(`Required approved input is missing: ${path}`);

const uniquePaths = Array.from(new Set([baseRel, v30Performance, privateTeaching, shoreLead, ...storm.map(segment => segment.path)]));
const input = new Map(uniquePaths.map((path, index) => [path, index]));
const trim = (path: string, name: string, frames: number, sourceStart = 0) =>
  // Normalize every input to the chapter's 24-fps frame clock *before*
  // counting frames. Lip-sync sources arrive at 30 fps while assembled
  // coverage is already 24 fps; trimming first would silently shorten every
  // lip-sync span after frame-rate conversion.
  `[${input.get(path)!}:v]fps=${fps},trim=start_frame=${sourceStart}:end_frame=${sourceStart + frames},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,setpts=PTS-STARTPTS[${name}]`;

const filters: string[] = [
  trim(baseRel, "prefix", v30WrongStart),
  trim(v30Performance, "v30canon", mustardStart - v30WrongStart),
  trim(baseRel, "mustard", privateTeachingWrongStart - mustardStart, mustardStart),
  trim(privateTeaching, "privateCanon", 192),
  trim(shoreLead, "shoreCanon", stormStart - (privateTeachingWrongStart + 192)),
  ...storm.map((segment, index) => trim(segment.path, `storm${index}`, segment.frames, segment.sourceStart ?? 0)),
  trim(baseRel, "suffix", totalFrames - stormEndExclusive, stormEndExclusive)
];
const labels = ["[prefix]", "[v30canon]", "[mustard]", "[privateCanon]", "[shoreCanon]", ...storm.map((_, index) => `[storm${index}]`), "[suffix]"].join("");
filters.push(`${labels}concat=n=${storm.length + 6}:v=1:a=0[video]`);

const output = join(assets, outputRel);
execFileSync("ffmpeg", ["-v", "error", "-y", ...uniquePaths.flatMap(path => ["-i", join(assets, path)]), "-filter_complex", filters.join(";"), "-map", "[video]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output], { stdio: "inherit" });

const readFrameCount = (path: string) => Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", path], { encoding: "utf8" }).trim());
const audioHash = (path: string) => createHash("md5").update(execFileSync("ffmpeg", ["-v", "error", "-i", path, "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"], { encoding: "buffer" })).digest("hex");
const frames = readFrameCount(output);
if (frames !== totalFrames) throw new Error(`Frame lock failed: expected ${totalFrames}, received ${frames}.`);
if (audioHash(join(assets, baseRel)) !== audioHash(output)) throw new Error("Audio stream changed during picture-only repair.");

const db = getDb(), id = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outputRel, Math.round(totalFrames / fps * 1000), storm.length + 6, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(id, JSON.stringify({ pictureBase: baseRel, repairedRanges: [[v30WrongStart, mustardStart - 1], [privateTeachingWrongStart, stormEndExclusive - 1]], stormPlan: storm }), JSON.stringify({ audioUnchangedFrom: baseRel, reason: "Producer-directed canonical-identity and storm-geography repair." }));
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'project',?,'human',?,1,?)")
    .run(randomUUID(), projectId, projectId, "Producer-directed repair: remove late off-canon Jesus views and replace the mixed land/storm stretch with Scene 7 storm coverage and approved storm performances. Source/cast audio and chapter frame clock remain locked.", now);
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK"); throw error;
}
console.log(JSON.stringify({ outputRel, frames, repairedRanges: [[v30WrongStart, mustardStart - 1], [privateTeachingWrongStart, stormEndExclusive - 1]], stormPieces: storm.length, audioMd5: audioHash(output) }, null, 2));
