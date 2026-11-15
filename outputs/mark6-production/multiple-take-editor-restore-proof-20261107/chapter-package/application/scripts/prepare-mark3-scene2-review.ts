/** Source-continuous Scene 2 review cut; no candidate is selected by this script. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const sceneId = "dcfeacde-0b67-4a40-be25-2762ae1d5d92";
const sceneStart = 92799, sceneEnd = 172258;
const beats = [
  { shot: 1, attempt: "ccbe55f1-afa7-4550-a1c9-05ef60071660", end: 8000 },
  { shot: 1, attempt: "a80b8941-288a-4c8b-9c5e-02e891e77889", end: 16000 },
  { shot: 1, attempt: "64349e84-c51c-4ef4-916a-617e4fc4d04a", end: 24000 },
  { shot: 1, attempt: "9adcd197-3acd-4f26-b8a1-5408bce2513b", end: 32498 },
  { shot: 2, attempt: "55543614-caa7-411c-8f98-be73e45e5edb", end: 40498 },
  { shot: 2, attempt: "6d08fa72-97e0-4eab-bd35-7062c819e3ac", end: 46498 },
  { shot: 3, attempt: "418d04e8-5b7b-4eaf-9cde-81cc0e24b9e3", end: 54498 },
  { shot: 3, attempt: "ac80556c-3216-422c-b187-904fac6b7d01", end: 59266 },
  { shot: 4, attempt: "47204e0e-8778-4087-ba59-522297500b6d", end: 63266 },
  { shot: 4, attempt: "4e1eaa35-44b3-4463-8d4b-83382cd7c587", end: 69264 },
  { shot: 5, attempt: "94523e4f-1d40-4c67-ae8b-3d656fa69753", end: 71952 },
  { shot: 6, attempt: "b8c2711a-7f6b-4b47-b1d9-6c149a1ea449", end: 79459 }
] as const;

const db = getDb(), root = join(getDataDir(), "assets");
const shots = db.prepare("SELECT id,sequence FROM shots WHERE scene_id=? ORDER BY sequence").all(sceneId) as Array<{ id: string; sequence: number }>;
if (shots.length !== 6 || shots.some((s, i) => s.sequence !== i + 1)) throw new Error("Scene 2 shot plan changed.");
const audio = db.prepare("SELECT source_path,start_ms,end_ms FROM audio_segments WHERE project_id=? AND layer='original_reading' AND start_ms=? LIMIT 1")
  .get(projectId, sceneStart) as { source_path: string; start_ms: number; end_ms: number } | undefined;
const speaker = db.prepare("SELECT source_start_ms,source_end_ms,source_hash FROM shot_utterance_bindings WHERE shot_id=?")
  .get(shots[4]!.id) as { source_start_ms: number; source_end_ms: number; source_hash: string } | undefined;
const cast = db.prepare(`SELECT a.source_path,a.start_ms,a.end_ms,m.source_hash FROM audio_segments a
  JOIN composite_audio_source_map m ON m.composite_segment_id=a.id JOIN shot_utterance_bindings b ON b.source_audio_segment_id=m.original_segment_id
  WHERE b.shot_id=? AND a.project_id=? AND a.layer='composite_cast_master'`).get(shots[4]!.id, projectId) as
  { source_path: string; start_ms: number; end_ms: number; source_hash: string } | undefined;
if (!audio || speaker?.source_start_ms !== 162063 || speaker.source_end_ms !== 163996 || !cast || cast.source_hash !== speaker.source_hash) throw new Error("Approved Scene 2 source or cast binding changed.");
const originalPath = join(root, audio.source_path), castPath = join(root, cast.source_path);
const bridge = join(root, "generated/video/mark3-scene2-shot4-bridge-first-half-muted.mp4");
for (const path of [originalPath, castPath, bridge]) if (!existsSync(path)) throw new Error(`Missing soundtrack ${path}`);

const run = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"], timeout: 180000 });
const directory = mkdtempSync(join(tmpdir(), "heartword-scene2-review-"));
try {
  let previousEnd = 0;
  const parts: string[] = [];
  const manifest: Array<{ shot: number; attempt: string; startMs: number; endMs: number; frames: number }> = [];
  for (const [index, beat] of beats.entries()) {
    const row = db.prepare("SELECT shot_id,status,result_asset_path FROM generation_attempts WHERE id=?")
      .get(beat.attempt) as { shot_id: string; status: string; result_asset_path: string | null } | undefined;
    if (!row || row.shot_id !== shots[beat.shot - 1]!.id || !["accepted", "hold_for_review"].includes(row.status) || !row.result_asset_path) throw new Error(`Unavailable picture beat ${beat.attempt}`);
    const source = join(root, row.result_asset_path);
    if (!existsSync(source)) throw new Error(`Missing picture ${source}`);
    const frames = Math.round(beat.end * 24 / 1000) - Math.round(previousEnd * 24 / 1000);
    const part = join(directory, `part-${String(index).padStart(2, "0")}.mp4`);
    run(["-i", source, "-an", "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,tpad=stop_mode=clone:stop_duration=5", "-frames:v", String(frames), "-c:v", "libx264", "-preset", "fast", "-crf", "18", part]);
    parts.push(part);
    manifest.push({ shot: beat.shot, attempt: beat.attempt, startMs: previousEnd, endMs: beat.end, frames });
    previousEnd = beat.end;
  }
  if (previousEnd !== sceneEnd - sceneStart) throw new Error("Picture does not cover the source scene span.");
  const list = join(directory, "picture.txt");
  writeFileSync(list, parts.map(p => `file '${p.replaceAll("\\", "/")}'`).join("\n"));
  const silent = join(directory, "picture.mp4");
  run(["-f", "concat", "-safe", "0", "-i", list, "-c:v", "copy", silent]);
  const out = join(root, "generated", "video", "review", "mark3-scene2-full-source-review-r1.mp4");
  mkdirSync(dirname(out), { recursive: true });
  run(["-i", silent, "-i", originalPath, "-i", castPath, "-i", bridge,
    "-filter_complex", [
      "[1:a]atrim=start=92.799:end=162.063,asetpts=PTS-STARTPTS,aresample=48000[a0]",
      "[2:a]atrim=start=0:end=1.933,asetpts=PTS-STARTPTS,aresample=48000[a1]",
      "[1:a]atrim=start=163.996:end=172.258,asetpts=PTS-STARTPTS,aresample=48000[a2]",
      "[a0][a1][a2]concat=n=3:v=0:a=1[main]",
      "[3:a]atrim=start=0:end=4,asetpts=PTS-STARTPTS,aresample=48000,adelay=59266:all=1[breath]",
      "[main][breath]amix=inputs=2:duration=first:normalize=0[a]"
    ].join(";"), "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", "79.459", "-movflags", "+faststart", out]);
  writeFileSync(join(root, "generated", "video", "review", "mark3-scene2-full-source-review-r1.json"), JSON.stringify({ sceneStart, sceneEnd, picture: manifest,
    soundtrack: [
      { source: audio.source_path, startMs: 92799, endMs: 162063 },
      { source: cast.source_path, startMs: 0, endMs: 1933, targetStartMs: 162063 },
      { source: audio.source_path, startMs: 163996, endMs: 172258 },
      { source: "generated/video/mark3-scene2-shot4-bridge-first-half-muted.mp4", startMs: 0, endMs: 4000, targetStartMs: 152065, role: "producer-approved quiet breathing" }
    ] }, null, 2));
  console.log(JSON.stringify({ out, durationMs: previousEnd, frames: manifest.reduce((n, item) => n + item.frames, 0) }));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
