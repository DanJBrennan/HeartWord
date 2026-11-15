/**
 * Rebuild only the defective post-frame-3034 picture of Mark 4. The repair
 * keeps the locked opening and storm material, replaces the improvised
 * slow/off-canon/location-jumping teaching coverage with approved canonical
 * hillside and parable coverage, and rebuilds the dialogue mix from the
 * verified source plus the corrected cast-master intervals.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

type Turn = { id: string; start_ms: number; end_ms: number; verse_ref: string | null; speaker: string; path: string; composite_ms: number };
type PicturePiece = { path: string; sourceStart: number; duration: number; label: string };

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir(), assets = join(dataDir, "assets"), db = getDb();
const priorRel = "generated/chapter/mark4-autonomous-overnight-final-v23-thorn-continuity-repair.mp4";
const prior = join(assets, priorRel);
const pictureRel = "generated/editorial/mark4-continuity/post3034-canonical-picture.mp4";
const outRel = "generated/chapter/mark4-autonomous-overnight-final-v24-post3034-continuity.mp4";
const pictureOut = join(assets, pictureRel), out = join(assets, outRel);
const fps = 24, intro = 11.5, sourceEnd = 515.792, total = 551.292;
// FFmpeg's time trim includes an exact-boundary decoded image on this source.
// Start half a frame before the producer's first replacement frame so the
// preserved portion ends at frame 3033 and frame 3034 is repaired.
const repairStart = (3034 - 0.5) / fps;
const stormStart = intro + 424.373;

const circle = [
  "generated/assembled/b1b92c1b-dbc0-4534-8db3-e7a859f66c45.mp4",
  "generated/assembled/db0de7b7-3b29-4c71-bfe6-558c5193919d.mp4",
  "generated/assembled/320af5b4-3b1e-4345-83dd-c8aa3d184af5.mp4",
  "generated/assembled/6096a4f9-7032-440d-97c8-ee2d92f377d7.mp4",
  "generated/assembled/dd78acd1-a146-48de-bddb-ac0a18a44674.mp4",
  "generated/assembled/31139734-b0c9-4454-b04a-d8d378d20ed6.mp4",
  "generated/assembled/cfdb65be-62c3-4c88-b2e7-8d2f5459ab39.mp4"
];
const field = [
  "generated/assembled/e282642c-bacb-425b-815a-93d69dc1e243.mp4",
  "generated/assembled/32df6211-f70c-4540-8de8-d29924aad73e.mp4",
  "generated/assembled/9543eea6-1082-4b7c-ab33-4c3ea948457c.mp4",
  "generated/assembled/20496fa7-983d-47a3-ab9d-67d796aaef20.mp4",
  "generated/assembled/4c3cea05-88ca-4d69-96b1-35ca1e05f7f0.mp4",
  "generated/assembled/0662b8a6-134b-43d4-918c-21d938c79a5c.mp4"
];
const v11 = "generated/chapter/mark4-v11-three-clip-pilot-review.mp4";
const v13 = "generated/lipsync-face/933020659205799987.mp4";

const source = db.prepare("SELECT audio_path FROM project_source_bindings WHERE project_id=?").get(projectId) as { audio_path: string } | undefined;
const bed = db.prepare("SELECT path FROM production_audio_assets WHERE project_id=? AND description='Quiet looping chapter underscoring' ORDER BY created_at DESC LIMIT 1").get(projectId) as { path: string } | undefined;
const finale = db.prepare("SELECT path FROM production_audio_assets WHERE project_id=? AND description='Mark 4 post-source dawn-horizon ending' ORDER BY created_at DESC LIMIT 1").get(projectId) as { path: string } | undefined;
if (!source || !bed || !finale) throw new Error("Source recording or reviewed music assets are unavailable.");

const turns = db.prepare(`SELECT a.id,a.start_ms,a.end_ms,a.verse_ref,c.name speaker,co.source_path,
  co.start_ms composite_start,co.end_ms composite_end
  FROM audio_segments a JOIN characters c ON c.id=a.speaker_character_id
  JOIN composite_audio_source_map m ON m.original_segment_id=a.id
  JOIN audio_segments co ON co.id=m.composite_segment_id
  WHERE a.project_id=? AND a.layer='original_reading'
  ORDER BY a.start_ms`).all(projectId).map((row: any) => ({
  id: row.id, start_ms: row.start_ms, end_ms: row.end_ms, verse_ref: row.verse_ref,
  speaker: row.speaker, path: row.source_path, composite_ms: row.composite_end - row.composite_start
})) as Turn[];
if (!turns.length) throw new Error("No source-bound cast intervals are available.");
for (const path of [priorRel, source.audio_path, bed.path, finale.path, v11, v13, ...circle, ...field, ...turns.map(turn => turn.path)]) {
  if (!existsSync(join(assets, path))) throw new Error(`Required repair input is missing: ${path}`);
}
mkdirSync(join(assets, "generated", "editorial", "mark4-continuity"), { recursive: true });

const pieces: PicturePiece[] = [];
const addBase = (start: number, end: number, label: string) => pieces.push({ path: priorRel, sourceStart: start, duration: end - start, label });
let circleIndex = 0, fieldIndex = 0;
function addPool(start: number, end: number, pool: string[], kind: "circle" | "field") {
  let cursor = start;
  while (cursor < end - 0.0001) {
    const index = kind === "circle" ? circleIndex++ : fieldIndex++;
    const path = pool[index % pool.length]!;
    const take = Math.min(4, end - cursor); // no slow-downs or frozen padding
    pieces.push({ path, sourceStart: 0, duration: take, label: kind });
    cursor += take;
  }
}

// Repair start through the Mark 4:11 pilot: only canonical listener/geometry
// coverage, then the already producer-approved covered performance.
addBase(0, repairStart, "preserved-pre-repair");
addPool(repairStart, intro + 133.062, circle, "circle");
pieces.push({ path: v11, sourceStart: 0, duration: 11.068, label: "approved-mark4-11-performance" });
// Jesus's private explanation stays in one hillside teaching world. Its first
// approved performance is retained; subsequent speech uses listener/wide
// covers while the continuous Jesus cast voice remains on the audio master.
addPool(intro + 144.13, intro + 172.991, circle, "circle");
pieces.push({ path: v13, sourceStart: 0, duration: 7, label: "approved-mark4-13-performance" });
addPool(intro + 179.991, intro + 312.663, circle, "circle");
// The seed-growing parable moves deliberately to its described field imagery,
// rather than a boat or a repeated teaching image.
addPool(intro + 312.663, intro + 358.269, field, "field");
// The mustard teaching returns once to the established private hillside, not
// to the rejected boat shots. The following narrator material remains there
// until the already approved storm departure begins.
addPool(intro + 358.269, stormStart, circle, "circle");
addBase(stormStart, total, "preserved-approved-storm-and-ending");

const pieceDuration = pieces.reduce((sum, piece) => sum + piece.duration, 0);
if (Math.abs(pieceDuration - total) > 0.01) throw new Error(`Picture plan drifted from protected duration: ${pieceDuration}.`);

// First create a durable picture-only candidate. Every inserted shot is kept
// at its native motion speed and capped to four seconds to avoid the earlier
// slow/frozen coverage problem.
const uniquePaths = [...new Set(pieces.map(piece => piece.path))];
const indexFor = new Map(uniquePaths.map((path, index) => [path, index]));
const videoFilters = pieces.map((piece, index) => {
  const input = indexFor.get(piece.path)!;
  return `[${input}:v]trim=start=${piece.sourceStart.toFixed(3)}:duration=${piece.duration.toFixed(3)},` +
    `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=${fps},setpts=PTS-STARTPTS[p${index}]`;
});
videoFilters.push(`${pieces.map((_, index) => `[p${index}]`).join("")}concat=n=${pieces.length}:v=1:a=0[video]`);
execFileSync("ffmpeg", ["-v", "error", "-y", ...uniquePaths.flatMap(path => ["-i", join(assets, path)]),
  "-filter_complex", videoFilters.join(";"), "-map", "[video]", "-t", total.toFixed(3),
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", pictureOut],
  { stdio: ["ignore", "ignore", "pipe"] });

const pictureDuration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", pictureOut], { encoding: "utf8" }).trim());
if (Math.abs(pictureDuration - total) > 0.15) throw new Error("Picture repair changed the protected runtime.");

// Rebuild the continuous source/cast master across every angle. Picture edits
// cannot cause an attributed line to revert to narrator audio.
let cursor = 0, label = 0;
const audioFilters: string[] = [], audioPieces: string[] = [];
for (const turn of turns) {
  const start = turn.start_ms / 1000, end = turn.end_ms / 1000, duration = end - start;
  if (start > cursor) {
    audioFilters.push(`[1:a]atrim=start=${cursor.toFixed(3)}:end=${start.toFixed(3)},asetpts=PTS-STARTPTS[o${label}]`);
    audioPieces.push(`[o${label++}]`);
  }
  const input = 2 + turns.indexOf(turn), tempo = (turn.composite_ms / 1000 / duration).toFixed(6);
  audioFilters.push(`[${input}:a]atrim=start=0:end=${(turn.composite_ms / 1000).toFixed(3)},asetpts=PTS-STARTPTS,atempo=${tempo},atrim=duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS[c${label}]`);
  audioPieces.push(`[c${label++}]`); cursor = end;
}
if (cursor < sourceEnd) {
  audioFilters.push(`[1:a]atrim=start=${cursor.toFixed(3)}:end=${sourceEnd.toFixed(3)},asetpts=PTS-STARTPTS[o${label}]`);
  audioPieces.push(`[o${label++}]`);
}
const bedInput = 2 + turns.length, finaleInput = bedInput + 1, outroStart = intro + sourceEnd;
audioFilters.push(
  `${audioPieces.join("")}concat=n=${audioPieces.length}:v=0:a=1[chapter]`,
  `anullsrc=r=44100:cl=stereo:d=${intro}[introSilence]`,
  "anullsrc=r=44100:cl=stereo:d=24[outroSilence]",
  "[introSilence][chapter][outroSilence]concat=n=3:v=0:a=1[rawProgram]",
  "[rawProgram]volume=10dB[program]",
  `[${bedInput}:a]atrim=duration=${total},asetpts=PTS-STARTPTS,volume='if(lt(t,10.5),0.55,if(lt(t,12),0.55-(t-10.5)*0.3433333,0.035))'[bed]`,
  `[${finaleInput}:a]atrim=duration=24,asetpts=PTS-STARTPTS,volume=0.8,adelay=${Math.round(outroStart * 1000)}:all=1[finale]`,
  "[program][bed][finale]amix=inputs=3:duration=first:normalize=0,alimiter=limit=0.98:level=false[mix]",
  "[mix]loudnorm=I=-16:TP=-1.5:LRA=11[audio]"
);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", pictureOut, "-i", join(assets, source.audio_path),
  ...turns.flatMap(turn => ["-i", join(assets, turn.path)]), "-stream_loop", "-1", "-i", join(assets, bed.path), "-i", join(assets, finale.path),
  "-filter_complex", audioFilters.join(";"), "-map", "0:v:0", "-map", "[audio]", "-t", total.toFixed(3),
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out], { stdio: ["ignore", "ignore", "pipe"] });

const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out], { encoding: "utf8" }).trim()) * 1000);
if (Math.abs(durationMs - Math.round(total * 1000)) > 150) throw new Error("Final continuity candidate changed the protected runtime.");

const id = randomUUID();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outRel, durationMs, pieces.length, Date.now());
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,
    JSON.stringify({ repairStartFrame: 3034, repairEndFrameExclusive: Math.round(stormStart * fps), pieces: pieces.map(piece => ({ ...piece, durationMs: Math.round(piece.duration * 1000) })) }),
    JSON.stringify({ pictureBase: priorRel, source: source.audio_path, continuousCastTurns: turns.map(turn => ({ verseRef: turn.verse_ref, speaker: turn.speaker, startMs: turn.start_ms, endMs: turn.end_ms, castAudio: turn.path })), audioRule: "Every attributed source interval uses its cast master continuously across all coverage." }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outRel, pictureRel, durationMs, pieces: pieces.length, castTurns: turns.length }, null, 2));
