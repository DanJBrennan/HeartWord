/** Complete the source-clock opening using approved picture only; no DB mutation. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const db = getDb(), root = join(getDataDir(), "assets");
const ids = ["91097824-29df-435c-ae00-ad839bdbc511", "c638791a-51f4-4018-a5cf-65cfce3c83ba", "b3d64f2d-90ff-4b6c-8cda-dd98391a0d50"];
const beats = [
  { start: 0, end: 4616, shot: 1, kind: "still", direction: "left" },
  { start: 4616, end: 12616, shot: 1, kind: "motion" },
  { start: 12616, end: 18616, shot: 1, kind: "still", direction: "right" },
  { start: 18616, end: 26616, shot: 2, kind: "motion" },
  { start: 26616, end: 29569, shot: 2, kind: "still", direction: "left" },
  { start: 29569, end: 37752, shot: 3, kind: "assembled" },
  { start: 37752, end: 41733, shot: 2, kind: "still", direction: "right" },
] as const;
if (beats.some((b, i) => b.end <= b.start || (i && b.start !== beats[i - 1]!.end))) throw new Error("Opening beat continuity changed.");
const run = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "pipe", timeout: 180000 });
const sec = (n: number) => (n / 1000).toFixed(3);
const source = db.prepare("SELECT source_path FROM audio_segments WHERE project_id=? AND layer='original_reading' AND start_ms=588")
  .get("0b386bfc-7919-4f40-91af-e198508a8267") as { source_path: string } | undefined;
if (!source) throw new Error("Original source missing.");
const original = join(root, source.source_path);
const cast3 = join(root, "generated/hatam/mark-3/composite_cast_master/04-segment-3-elevenlabs.mp3");
const castTail = join(root, "generated/hatam/mark-3/composite_cast_master/05-segment-4-elevenlabs.mp3");
for (const p of [original, cast3, castTail]) if (!existsSync(p)) throw new Error(`Audio missing: ${p}`);
const work = mkdtempSync(join(tmpdir(), "heartword-mark3-opening-"));
try {
  const parts: string[] = [];
  const manifest: Array<(typeof beats)[number] & { path: string; normalizedPath: string; frames: number }> = [];
  for (const [i, b] of beats.entries()) {
    const operation = b.kind === "still" ? "generate" : b.kind === "assembled" ? "assemble_shot" : "generate_final_video";
    const row = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation=? AND status='accepted' ORDER BY created_at DESC LIMIT 1`)
      .get(ids[b.shot - 1]!, operation) as { result_asset_path: string } | undefined;
    if (!row?.result_asset_path) throw new Error(`Approved ${operation} missing for beat ${i + 1}`);
    const path = join(root, row.result_asset_path);
    if (!existsSync(path)) throw new Error(`Picture missing: ${path}`);
    const frames = Math.round(b.end * 24 / 1000) - Math.round(b.start * 24 / 1000);
    const part = join(work, `beat-${String(i + 1).padStart(2, "0")}.mp4`);
    if (b.kind === "still") {
      const x = b.direction === "left" ? `(in_w-out_w)*n/${frames}` : `(in_w-out_w)*(1-n/${frames})`;
      run(["-loop", "1", "-framerate", "24", "-i", path, "-vf", `scale=1408:792,crop=1280:720:x='${x}':y=36`, "-frames:v", String(frames), "-an", "-c:v", "libx264", "-crf", "18", part]);
    } else {
      run(["-i", path, "-an", "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,tpad=stop_mode=clone:stop_duration=1", "-frames:v", String(frames), "-c:v", "libx264", "-crf", "18", part]);
    }
    const normalizedPath = `generated/video/coverage/mark3-scene1-opening-beat${String(i + 1).padStart(2, "0")}-r1.mp4`;
    mkdirSync(dirname(join(root, normalizedPath)), { recursive: true });
    copyFileSync(part, join(root, normalizedPath));
    parts.push(part);
    manifest.push({ ...b, path: row.result_asset_path, normalizedPath, frames });
  }
  const list = join(work, "parts.txt");
  writeFileSync(list, parts.map(p => `file '${p.replaceAll("\\", "/")}'`).join("\n"));
  const picture = join(work, "picture.mp4");
  run(["-f", "concat", "-safe", "0", "-i", list, "-c:v", "copy", picture]);
  const filter = [
    `[1:a]atrim=start=0:end=29.569,asetpts=PTS-STARTPTS,aresample=48000[a0]`,
    `[2:a]atrim=start=0:end=8.183,asetpts=PTS-STARTPTS,aresample=48000,apad,atrim=duration=8.183[a1]`,
    `[3:a]atrim=start=0:end=3.177,asetpts=PTS-STARTPTS,aresample=48000,apad,atrim=duration=3.177[a2]`,
    `[1:a]atrim=start=40.929:end=41.733,asetpts=PTS-STARTPTS,aresample=48000[a3]`,
    `[a0][a1][a2][a3]concat=n=4:v=0:a=1[a]`,
  ].join(";");
  const output = join(root, "generated/video/review/mark3-scene1-opening-full-source-review-r1.mp4");
  mkdirSync(dirname(output), { recursive: true });
  run(["-i", picture, "-i", original, "-i", cast3, "-i", castTail, "-filter_complex", filter, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", sec(41733), "-movflags", "+faststart", output]);
  writeFileSync(output.replace(/\.mp4$/, ".json"), JSON.stringify({ sourceStartMs: 0, sourceEndMs: 41733, picture: manifest,
    audio: [{ start: 0, end: 29569, type: "original" }, { start: 29569, end: 37752, type: "approved_cast", source: cast3 },
      { start: 37752, end: 40929, type: "approved_cast", source: castTail }, { start: 40929, end: 41733, type: "original" }] }, null, 2));
  console.log(JSON.stringify({ output, beats: manifest.length, frames: manifest.reduce((n, b) => n + b.frames, 0) }));
} finally { rmSync(work, { recursive: true, force: true }); }
