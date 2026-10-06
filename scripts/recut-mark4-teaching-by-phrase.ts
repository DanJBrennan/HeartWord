/**
 * Recut the long teaching portion of v35 from distinct existing coverage.
 * The edit removes the generator's 8-second cadence without making any new
 * image/video request.  Jesus is covered by listeners, backs, and wide views
 * unless the image is an already approved source-bound performance.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

type Piece = { path: string; startFrame: number; endFrame: number; label: string; native?: boolean };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const assets = join(getDataDir(), "assets");
const fps = 24, totalFrames = 13231;
const baseRel = "generated/chapter/mark4-autonomous-overnight-final-v35-aesthetic-first-pass-frame-locked.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v36-phrase-led-teaching-recut-v2.mp4";

// All selected private-teaching takes keep Jesus either turned away, at a
// distance, or framed with listeners; excluded takes contain readable generic
// mouth movement or one of the visibly inconsistent close-up identities.
const privateCoverage = [
  "generated/assembled/e31e2a51-e352-4e68-9e02-bf60b37be674.mp4",
  "generated/assembled/dc9accab-c310-48b2-901a-44c6fc29b0e6.mp4",
  "generated/assembled/1df48c5d-55b4-43bc-872a-dde88846ef46.mp4",
  "generated/assembled/dd78acd1-a146-48de-bddb-ac0a18a44674.mp4",
  "generated/assembled/1bd01708-fa9f-4bc3-8075-38f4eec4ef8c.mp4",
  "generated/assembled/b1b92c1b-dbc0-4534-8db3-e7a859f66c45.mp4",
  "generated/assembled/db0de7b7-3b29-4c71-bfe6-558c5193919d.mp4",
  "generated/assembled/cfdb65be-62c3-4c88-b2e7-8d2f5459ab39.mp4",
  "generated/assembled/744e014d-126f-4782-9dc6-2facd051e60a.mp4",
  "generated/assembled/31139734-b0c9-4454-b04a-d8d378d20ed6.mp4"
];
const shoreCoverage = [
  "generated/assembled/6628e1e9-47ee-42de-b7b9-e3f578847c5b.mp4",
  "generated/assembled/0003976f-7c1a-4508-a40c-cad61cd7bb37.mp4",
  "generated/assembled/c84b12da-2581-4e08-8bcc-513e41b6b79b.mp4",
  "generated/assembled/7d834822-3bf2-442b-90a7-2c24a8fca1d7.mp4",
  "generated/assembled/91cf250a-92f0-45cc-bf95-6fe627f9b5b1.mp4",
  "generated/assembled/e85b706b-2cd3-4c60-93a8-4c508ac0e122.mp4",
  "generated/assembled/c650fbc7-8697-4f1a-beec-2fc7470f5706.mp4"
];
const fieldCoverage = [
  "generated/assembled/e282642c-bacb-425b-815a-93d69dc1e243.mp4",
  "generated/assembled/32df6211-f70c-4540-8de8-d29924aad73e.mp4",
  "generated/assembled/9543eea6-1082-4b7c-ab33-4c3ea948457c.mp4",
  "generated/assembled/20496fa7-983d-47a3-ab9d-67d796aaef20.mp4",
  "generated/assembled/4c3cea05-88ca-4d69-96b1-35ca1e05f7f0.mp4",
  "generated/assembled/0662b8a6-134b-43d4-918c-21d938c79a5c.mp4",
  "generated/assembled/049427ae-7663-418c-8e08-0104b12dcf1d.mp4"
];
for (const rel of [baseRel, ...privateCoverage, ...shoreCoverage, ...fieldCoverage]) if (!existsSync(join(assets, rel))) throw new Error(`Missing approved coverage: ${rel}`);

const parts: Piece[] = [{ path: baseRel, startFrame: 0, endFrame: 4596, label: "preserved-before-private-explanation" }];
function addNative(paths: string[], frames: number[], label: string) {
  if (paths.length !== frames.length) throw new Error(`${label} plan is not one-to-one.`);
  for (const [index, path] of paths.entries()) parts.push({ path, startFrame: 0, endFrame: frames[index]!, label, native: true });
}
// 4:14–20: picture changes are grouped around the recorded phrase ends
// (not a provider-clock loop).  The selected material is the one private
// hillside world, and no generated take is reset or cyclically reused.
addNative(privateCoverage, [184,188,188,184,188,188,192,192,192,192], "Mark 4:14–20 private teaching");
// 4:21–25: return to the public shore.  The source's narrator lead-in and
// Jesus's speech both remain in that single location; no boat pilot intrudes.
addNative(shoreCoverage, [184,176,192,176,184,192,192], "Mark 4:21–25 shoreline teaching");
// 4:26–29: parable imagery has its own field grammar and is cut in varied,
// phrase-scaled pieces rather than anonymous eight-second stock repetitions.
addNative(fieldCoverage, [144,152,168,160,144,160,167], "Mark 4:26–29 growing-seed illustration");
// Preserve v30's approved opening performance and the approved v31–32
// mustard-seed sequence; the next pass will add held performance candidates.
parts.push({ path: baseRel, startFrame: 8875, endFrame: 9148, label: "preserved-Mark-4-30-opening" });
parts.push({ path: baseRel, startFrame: 9148, endFrame: totalFrames, label: "preserved-approved-mustard-storm-ending" });

const expected = parts.reduce((sum, piece) => sum + piece.endFrame - piece.startFrame, 0);
if (expected !== totalFrames) throw new Error(`Expected ${totalFrames} frames, planned ${expected}.`);
const paths = [...new Set(parts.map(part => part.path))];
const input = new Map(paths.map((path, index) => [path, index]));
const filter = parts.map((part, index) => {
  const normalize = part.native ? `fps=${fps},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,` : "";
  return `[${input.get(part.path)!}:v]${normalize}trim=start_frame=${part.startFrame}:end_frame=${part.endFrame},setpts=PTS-STARTPTS[p${index}]`;
});
filter.push(`${parts.map((_, index) => `[p${index}]`).join("")}concat=n=${parts.length}:v=1:a=0[video]`);
const output = join(assets, outputRel);
execFileSync("ffmpeg", ["-v", "error", "-y", ...paths.flatMap(path => ["-i", join(assets, path)]), "-filter_complex", filter.join(";"), "-map", "[video]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output], { stdio: "inherit" });

const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
const audioHash = (path: string) => createHash("md5").update(execFileSync("ffmpeg", ["-v", "error", "-i", path, "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"], { encoding: "buffer" })).digest("hex");
if (frames !== totalFrames) throw new Error(`Frame lock failed: ${frames}.`);
if (audioHash(join(assets, baseRel)) !== audioHash(output)) throw new Error("Picture-only recut changed the approved audio stream.");

const db = getDb(), renderId = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(renderId, projectId, outputRel, Math.round(totalFrames / fps * 1000), parts.length, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(renderId, JSON.stringify({ pictureBase: baseRel, phraseLedRanges: [[4596,6484],[6484,7780],[7780,8875]], pieces: parts }), JSON.stringify({ audioUnchangedFrom: baseRel, rule: "Source/cast audio remains continuous underneath non-speaking coverage." }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, frames, audioMd5: audioHash(output), shots: parts.length }, null, 2));
