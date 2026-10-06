/** Replace two visually defective Mark 4 coverage clips without changing the locked program audio. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir(), assets = join(dataDir, "assets"), db = getDb();
const prior = "generated/chapter/mark4-autonomous-overnight-final-v18-rocky-ground-continuity.mp4";
const canonBoat = "generated/video/4934ce6e-3894-4800-a8b9-c380d91ae570.mp4";
const activeTeaching = "generated/assembled/3ff6fea1-2515-4410-883b-38ae4025ccbd.mp4";
const outRel = "generated/chapter/mark4-autonomous-overnight-final-v19-canon-and-motion.mp4", out = join(assets, outRel);
const total = 551.292;
const boatStart = 115.602, boatEnd = 122.717;
const frozenStart = 136.479, frozenEnd = 141.768;
for (const path of [prior, canonBoat, activeTeaching]) if (!existsSync(join(assets, path))) throw new Error(`Missing approved input: ${path}`);

const boatDuration = boatEnd - boatStart, frozenDuration = frozenEnd - frozenStart;
const normalize = (input: number, start: number, end: number, label: string) =>
  `[${input}:v]trim=start=${start}:end=${end},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=24,setpts=PTS-STARTPTS[${label}]`;
const filter = [
  `[0:v]trim=start=0:end=${boatStart},setpts=PTS-STARTPTS[before]`,
  normalize(1, 0, boatDuration, "canonBoat"),
  `[0:v]trim=start=${boatEnd}:end=${frozenStart},setpts=PTS-STARTPTS[middle]`,
  normalize(2, 0, frozenDuration, "activeTeaching"),
  `[0:v]trim=start=${frozenEnd}:end=${total},setpts=PTS-STARTPTS[after]`,
  `[before][canonBoat][middle][activeTeaching][after]concat=n=5:v=1:a=0[video]`
].join(";");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(assets, prior), "-i", join(assets, canonBoat), "-i", join(assets, activeTeaching),
  "-filter_complex", filter, "-map", "[video]", "-map", "0:a:0", "-t", String(total),
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out],
  { stdio: ["ignore", "ignore", "pipe"] });
const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out], { encoding: "utf8" }).trim()) * 1000);
if (Math.abs(durationMs - Math.round(total * 1000)) > 150) throw new Error("Coverage repair changed the protected chapter duration.");
const id = randomUUID(); db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, outRel, durationMs, 166, Date.now());
  db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,
    JSON.stringify([
      { kind: "canonical_boat_teaching_replacement", startMs: Math.round(boatStart * 1000), endMs: Math.round(boatEnd * 1000) },
      { kind: "active_teaching_motion_replacement", startMs: Math.round(frozenStart * 1000), endMs: Math.round(frozenEnd * 1000) }
    ]),
    JSON.stringify({ pictureBase: prior, audioUnchanged: true, revisions: [
      "Replace non-canonical boat teacher coverage with approved canon-consistent Jesus boat view.",
      "Replace frozen Jesus teaching coverage with active, hand-gesturing canon-consistent teaching motion."
    ] }));
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outRel, durationMs, repairedIntervalsMs: [Math.round(boatDuration * 1000), Math.round(frozenDuration * 1000)] }, null, 2));
