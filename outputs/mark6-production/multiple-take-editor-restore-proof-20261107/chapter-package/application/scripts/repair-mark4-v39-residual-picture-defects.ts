/**
 * Held v41 picture-only correction for the producer's v39 findings.
 *
 * No source/cast audio is re-rendered here.  It removes two generic mouth
 * movement remnants, the confirmed harvest micro-flash, the repeated storm
 * tableau, and the meadow/grove oscillation from Mark 4:14–20.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

type Piece = { path: string; start: number; frames: number; label: string };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const fps = 24, totalFrames = 13447;
const baseRel = "generated/chapter/mark4-autonomous-overnight-final-v42-ambient-breaths-calm-timing-held.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v43-phrase-led-private-teaching-held.mp4";
const assets = join(getDataDir(), "assets"), base = join(assets, baseRel), output = join(assets, outputRel);

const olive = [
  "generated/assembled/e31e2a51-e352-4e68-9e02-bf60b37be674.mp4",
  "generated/assembled/dc9accab-c310-48b2-901a-44c6fc29b0e6.mp4",
  "generated/assembled/1df48c5d-55b4-43bc-872a-dde88846ef46.mp4",
  "generated/assembled/dd78acd1-a146-48de-bddb-ac0a18a44674.mp4",
  "generated/assembled/1bd01708-fa9f-4bc3-8075-38f4eec4ef8c.mp4",
  "generated/assembled/b1b92c1b-dbc0-4534-8db3-e7a859f66c45.mp4",
  "generated/assembled/db0de7b7-3b29-4c71-bfe6-558c5193919d.mp4",
  "generated/assembled/2d6b96b1-77c9-4cb8-9279-5eea5f0ff3f2.mp4",
  "generated/assembled/ee9b3077-fd56-4590-8a59-e9d07ba0cd23.mp4",
  "generated/assembled/cfdb65be-62c3-4c88-b2e7-8d2f5459ab39.mp4",
  "generated/assembled/744e014d-126f-4782-9dc6-2facd051e60a.mp4",
  "generated/assembled/31139734-b0c9-4454-b04a-d8d378d20ed6.mp4",
  "generated/assembled/6096a4f9-7032-440d-97c8-ee2d92f377d7.mp4",
  "generated/assembled/fdf0aa09-ecb0-4373-a23c-0604eed55c5e.mp4"
] as const;
const shoreListener = "generated/assembled/91cf250a-92f0-45cc-bf95-6fe627f9b5b1.mp4";
const calmListener = "generated/assembled/ecf4edd8-49f3-4ee9-8b66-14817ed02548.mp4";
for (const path of [baseRel, ...olive, shoreListener, calmListener]) if (!existsSync(join(assets, path))) throw new Error(`Missing approved repair input: ${path}`);

const pieces: Piece[] = [];
const addBase = (start: number, end: number, label: string) => pieces.push({ path: baseRel, start, frames: end - start, label });
const add = (path: string, start: number, frames: number, label: string) => pieces.push({ path, start, frames, label });
addBase(0, 4620, "unchanged through Mark 4:13");

// 4:14–20: every edit point is an observed >= 0.24 second pause in the
// original Hatam recording, mapped through the same held frame clock.  This
// replaces the former arbitrary 7–9 second cadence with phrase-led cuts.
// Each view is used once.  The final phrase ends at the existing editorial
// breath, which carries the visual handoff to the public shore.
const olivePlan: Array<[number, number, number]> = [
  [0, 0, 111], [1, 0, 139], [2, 0, 136], [3, 0, 170],
  [4, 0, 175], [5, 0, 185], [6, 0, 104], [7, 0, 149],
  [8, 0, 147], [9, 0, 192], [10, 0, 82], [11, 0, 95],
  [12, 0, 192]
];
const privateFrames = olivePlan.reduce((sum, [, , frames]) => sum + frames, 0);
if (privateFrames !== 1877) throw new Error(`Private-teaching plan must cover 1877 frames before its editorial breath, has ${privateFrames}.`);
for (const [asset, start, frames] of olivePlan) add(olive[asset]!, start, frames, "olive-grove phrase coverage");

addBase(6497, 6508, "continuous tail into the final recorded phrase end");
addBase(6508, 7236, "unchanged shore teaching");
// v39 removed only the first 176 frames of this generic boat take.  Continue
// the same established listener cover for the one missed second.
add(shoreListener, 168, 24, "shore listener continuation replaces generic boat mouth motion");
addBase(7260, 8977, "unchanged field and shore coverage");
// The two harvest-hand frames are discontinuous on both sides.  Extend the
// immediately preceding approved field image instead of introducing a new cut.
add(baseRel, 8976, 2, "continuous preceding field extension replaces harvest flash");
addBase(8979, 12616, "unchanged mustard and first storm tableau");
// The second nearly identical row-of-disciples tableau is a visible repeat.
// Use an existing calm listener reaction from the same storm scene instead.
add(calmListener, 0, 120, "distinct calm-disciple reaction replaces repeated tableau");
addBase(12736, totalFrames, "unchanged storm resolution and dawn handoff");

const plannedFrames = pieces.reduce((sum, piece) => sum + piece.frames, 0);
if (plannedFrames !== totalFrames) throw new Error(`Frame-lock plan has ${plannedFrames}, expected ${totalFrames}.`);
const paths = [...new Set(pieces.map(piece => piece.path))];
const index = new Map(paths.map((path, number) => [path, number]));
const filters = pieces.map((piece, number) =>
  `[${index.get(piece.path)!}:v]fps=${fps},trim=start_frame=${piece.start}:end_frame=${piece.start + piece.frames},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,setpts=PTS-STARTPTS[p${number}]`
);
filters.push(`${pieces.map((_, number) => `[p${number}]`).join("")}concat=n=${pieces.length}:v=1:a=0[video]`);
execFileSync("ffmpeg", ["-v", "error", "-y", ...paths.flatMap(path => ["-i", join(assets, path)]), "-filter_complex", filters.join(";"),
  "-map", "[video]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output],
  { stdio: "inherit" });

const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim());
const audioHash = (path: string) => createHash("md5").update(execFileSync("ffmpeg", ["-v", "error", "-i", path, "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"], { encoding: "buffer" })).digest("hex");
if (frames !== totalFrames) throw new Error(`Frame-lock failure: expected ${totalFrames}, received ${frames}.`);
if (audioHash(base) !== audioHash(output)) throw new Error("Picture-only repair changed the approved audio stream.");

const db = getDb(), id = randomUUID(), now = Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outputRel, Math.round(totalFrames / fps * 1000), pieces.length, now);
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(id, JSON.stringify({ pictureBase: baseRel, heldForReview: true, pieces, repairs: [
      { range: [4620, 6507], defect: "meadow/grove oscillation and generic grove mouth movement", treatment: "olive-grove coverage cut only at measured Hatam phrase pauses" },
      { range: [7236, 7259], defect: "residual generic boat mouth movement", treatment: "shore listener continuation" },
      { range: [8977, 8978], defect: "two-frame harvest flash", treatment: "preceding-field extension" },
      { range: [12616, 12735], defect: "repeated storm disciple tableau", treatment: "distinct calm listener reaction" }
    ] }), JSON.stringify({ audioUnchangedFrom: baseRel, sourceCastAudioUnchanged: true }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, frames, pieces: pieces.length, audioMd5: audioHash(output), heldForReview: true }, null, 2));
