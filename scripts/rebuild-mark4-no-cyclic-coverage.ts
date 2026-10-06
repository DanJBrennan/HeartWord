/**
 * Replace the Mark 4 post-frame-3034 cyclic fallback with distinct existing,
 * producer-approved coverage.  This is picture-only: source/cast audio and
 * the chapter clock remain locked.  The earlier standalone boat pilot is
 * deliberately excluded; the public/private teaching geography is carried by
 * the matching shoreline, hillside, and field coverage already in the library.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

type Piece = { path: string; sourceStart: number; duration: number; label: string };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const assets = join(getDataDir(), "assets");
const baseRel = "generated/chapter/mark4-autonomous-overnight-final-v25-post3034-continuity-frame-locked.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v27-distinct-coverage.mp4";
const base = join(assets, baseRel), output = join(assets, outputRel);
const fps = 24, frameCount = 13231, total = frameCount / fps;
const intro = 11.5, repairStart = (3034 - 0.5) / fps, stormStart = intro + 424.373;

// Each list is ordered by the passage it depicts.  A path occurs once only;
// addDistinct consumes native motion instead of resetting a pool modulo N.
const preV11 = [
  "generated/assembled/3ff6fea1-2515-4410-883b-38ae4025ccbd.mp4",
  "generated/assembled/51adeb68-f6ba-489e-a6c4-fe2fe43415fc.mp4",
  "generated/assembled/1486cad2-a9e7-49c5-b2f0-fddaec40225f.mp4"
];
const v12 = [
  "generated/assembled/b1b92c1b-dbc0-4534-8db3-e7a859f66c45.mp4",
  "generated/assembled/320af5b4-3b1e-4345-83dd-c8aa3d184af5.mp4",
  "generated/assembled/db0de7b7-3b29-4c71-bfe6-558c5193919d.mp4",
  "generated/assembled/6096a4f9-7032-440d-97c8-ee2d92f377d7.mp4"
];
const v14to20 = [
  "generated/assembled/e31e2a51-e352-4e68-9e02-bf60b37be674.mp4",
  "generated/assembled/dc9accab-c310-48b2-901a-44c6fc29b0e6.mp4",
  "generated/assembled/1df48c5d-55b4-43bc-872a-dde88846ef46.mp4",
  "generated/assembled/dd78acd1-a146-48de-bddb-ac0a18a44674.mp4",
  "generated/assembled/1bd01708-fa9f-4bc3-8075-38f4eec4ef8c.mp4",
  "generated/assembled/fdf0aa09-ecb0-4373-a23c-0604eed55c5e.mp4",
  "generated/assembled/d59de699-6095-401e-8e58-b99710c9b297.mp4",
  "generated/assembled/2d6b96b1-77c9-4cb8-9279-5eea5f0ff3f2.mp4",
  "generated/assembled/ee9b3077-fd56-4590-8a59-e9d07ba0cd23.mp4",
  "generated/assembled/cfdb65be-62c3-4c88-b2e7-8d2f5459ab39.mp4",
  "generated/assembled/744e014d-126f-4782-9dc6-2facd051e60a.mp4",
  "generated/assembled/31139734-b0c9-4454-b04a-d8d378d20ed6.mp4"
];
const v21to25 = [
  "generated/assembled/6628e1e9-47ee-42de-b7b9-e3f578847c5b.mp4",
  "generated/assembled/0003976f-7c1a-4508-a40c-cad61cd7bb37.mp4",
  "generated/assembled/c84b12da-2581-4e08-8bcc-513e41b6b79b.mp4",
  "generated/assembled/7d834822-3bf2-442b-90a7-2c24a8fca1d7.mp4",
  "generated/assembled/b367de9c-b1b3-4570-8a74-f780b0add322.mp4",
  "generated/assembled/8698ecb1-3d4f-475e-a798-39156449f04c.mp4",
  "generated/assembled/91cf250a-92f0-45cc-bf95-6fe627f9b5b1.mp4",
  "generated/assembled/e85b706b-2cd3-4c60-93a8-4c508ac0e122.mp4",
  "generated/assembled/c650fbc7-8697-4f1a-beec-2fc7470f5706.mp4",
  "generated/assembled/19d6346b-d40f-4847-8191-73259de8de5c.mp4"
];
const v26to29 = [
  "generated/assembled/e282642c-bacb-425b-815a-93d69dc1e243.mp4",
  "generated/assembled/32df6211-f70c-4540-8de8-d29924aad73e.mp4",
  "generated/assembled/9543eea6-1082-4b7c-ab33-4c3ea948457c.mp4",
  "generated/assembled/20496fa7-983d-47a3-ab9d-67d796aaef20.mp4",
  "generated/assembled/4c3cea05-88ca-4d69-96b1-35ca1e05f7f0.mp4",
  "generated/assembled/0662b8a6-134b-43d4-918c-21d938c79a5c.mp4",
  "generated/assembled/049427ae-7663-418c-8e08-0104b12dcf1d.mp4"
];
const v30to32 = [
  "generated/assembled/7f3fb060-0836-4c33-a510-f678cf1959f3.mp4",
  "generated/assembled/519df33a-1adc-4b10-9617-d9c4c3add6ed.mp4",
  "generated/assembled/cdc3d490-e11f-4e67-8d50-07e8112daa90.mp4",
  "generated/assembled/cacd5540-4576-4a15-b2bd-708eb27a4f8b.mp4",
  "generated/assembled/9522db93-f598-4777-ac1f-58cf67e6f72f.mp4"
];
const v33to34 = [
  "generated/assembled/f86b670d-d8b2-4352-82c0-5fbb75eb702a.mp4",
  "generated/assembled/8e7d5cd2-4a1d-4621-a4ab-958ad374ce4d.mp4",
  "generated/assembled/29cda8f3-2c78-4cbb-829a-1d67be2951ef.mp4",
  "generated/assembled/5ed18ff0-cfc2-4971-bffc-7d89fc02a3ff.mp4"
];
const v11 = "generated/chapter/mark4-v11-three-clip-pilot-review.mp4";
const v13 = "generated/lipsync-face/933020659205799987.mp4";
for (const path of [baseRel, v11, v13, ...preV11, ...v12, ...v14to20, ...v21to25, ...v26to29, ...v30to32, ...v33to34]) {
  if (!existsSync(join(assets, path))) throw new Error(`Missing approved repair input: ${path}`);
}

const durationCache = new Map<string, number>();
function duration(path: string) {
  const known = durationCache.get(path);
  if (known) return known;
  const value = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", join(assets, path)], { encoding: "utf8" }).trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Unreadable approved coverage: ${path}`);
  durationCache.set(path, value); return value;
}
const pieces: Piece[] = [{ path: baseRel, sourceStart: 0, duration: repairStart, label: "preserved-before-repair" }];
function addDistinct(start: number, end: number, paths: string[], label: string) {
  let cursor = start;
  for (const path of paths) {
    if (cursor >= end - 0.0001) break;
    const take = Math.min(duration(path), end - cursor);
    pieces.push({ path, sourceStart: 0, duration: take, label }); cursor += take;
  }
  if (cursor < end - 0.0001) throw new Error(`Distinct ${label} coverage is insufficient by ${(end - cursor).toFixed(3)}s; refusing to loop.`);
}
addDistinct(repairStart, intro + 133.062, preV11, "Mark 4:10–11 setup");
pieces.push({ path: v11, sourceStart: 0, duration: 11.068, label: "approved Mark 4:11 performance" });
// This also carries the narrated lead-in to the verse-13 question; it remains
// in the same private-teaching geography before the approved close performance.
addDistinct(intro + 144.13, intro + 172.991, v12, "Mark 4:12 and verse-13 lead-in");
pieces.push({ path: v13, sourceStart: 0, duration: 7, label: "approved Mark 4:13 performance" });
addDistinct(intro + 179.991, intro + 258.679, v14to20, "Mark 4:14–20 explanation");
addDistinct(intro + 258.679, intro + 312.663, v21to25, "Mark 4:21–25 teaching without boat pilot");
addDistinct(intro + 312.663, intro + 358.269, v26to29, "Mark 4:26–29 seed parable");
addDistinct(intro + 358.269, intro + 396.232, v30to32, "Mark 4:30–32 mustard teaching");
addDistinct(intro + 396.232, stormStart, v33to34, "Mark 4:33–34 transition to storm");
pieces.push({ path: baseRel, sourceStart: stormStart, duration: total - stormStart, label: "preserved storm and ending" });
const planned = pieces.reduce((sum, piece) => sum + piece.duration, 0);
if (Math.abs(planned - total) > 0.01) throw new Error(`The picture plan drifted from the locked chapter duration by ${(planned - total).toFixed(6)}s.`);

const paths = [...new Set(pieces.map(piece => piece.path))];
const index = new Map(paths.map((path, number) => [path, number]));
const filters = pieces.map((piece, number) => `[${index.get(piece.path)!}:v]trim=start=${piece.sourceStart.toFixed(6)}:duration=${piece.duration.toFixed(6)},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=${fps},setpts=PTS-STARTPTS[p${number}]`);
filters.push(`${pieces.map((_, number) => `[p${number}]`).join("")}concat=n=${pieces.length}:v=1:a=0[video]`);
execFileSync("ffmpeg", ["-v", "error", "-y", ...paths.flatMap(path => ["-i", join(assets, path)]), "-filter_complex", filters.join(";"),
  "-map", "[video]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output], { stdio: ["ignore", "ignore", "pipe"] });

const id = randomUUID(), db = getDb();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outputRel, Math.round(total * 1000), pieces.length, Date.now());
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)")
    .run(id, JSON.stringify({ pictureBase: baseRel, repairStartFrame: 3034, pieces, rule: "No cyclic fallback; each approved coverage take appears once." }),
      JSON.stringify({ audioUnchangedFrom: baseRel, reason: "Producer-directed replacement of visual loops only." }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outputRel, pieces: pieces.length, distinctCoverage: paths.length }, null, 2));
