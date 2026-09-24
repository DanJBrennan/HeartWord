/** Source-continuous review cuts for the remaining Mark 3 scenes. No selection mutation. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const project = "0b386bfc-7919-4f40-91af-e198508a8267";
const db = getDb(), root = join(getDataDir(), "assets");
type Beat = { start: number; end: number; shot: number; attempt?: string; still?: "left" | "right" | "scribe"; crop?: "scribe" };
const plans: Record<number, { start: number; end: number; beats: Beat[] }> = {
  3: { start: 172258, end: 245262, beats: [
    { start: 172258, end: 180258, shot: 1, attempt: "65ad21ac-74f6-4ec8-8c77-0f8f917aa6d4" },
    { start: 180258, end: 186188, shot: 1, attempt: "2247f632-8a21-486d-a6a2-5c72b8f0a546" },
    { start: 186188, end: 194122, shot: 2, attempt: "4c97b8a9-7b15-4410-b059-271eaf06d6c9" },
    { start: 194122, end: 202104, shot: 1, attempt: "2247f632-8a21-486d-a6a2-5c72b8f0a546" },
    { start: 202104, end: 210104, shot: 3, attempt: "592220d2-cd01-4bdb-895f-79c3d0ac21a4" },
    { start: 210104, end: 218104, shot: 3, attempt: "37048125-b248-43d0-b83b-af672995913a" },
    { start: 218104, end: 225321, shot: 3, attempt: "e3902d89-274f-4c71-9eb0-c061ae3eb2ad" },
    { start: 225321, end: 233321, shot: 4, attempt: "57e63953-ad89-45eb-9112-43c7293a0833" },
    { start: 233321, end: 241812, shot: 4, still: "left" },
    { start: 241812, end: 245262, shot: 4, still: "right" }
  ] },
  4: { start: 245262, end: 371645, beats: [
    { start: 245262, end: 250262, shot: 1, attempt: "0d30682c-17a3-42d9-bba6-86063cb39d61" },
    { start: 250262, end: 259262, shot: 1, still: "left" },
    { start: 259262, end: 267262, shot: 1, still: "right" },
    { start: 267262, end: 273262, shot: 2, still: "left" },
    { start: 273262, end: 281262, shot: 2, still: "right" },
    { start: 281262, end: 287262, shot: 2, still: "left" },
    { start: 287262, end: 295262, shot: 3, attempt: "223ca272-77e1-44ca-baea-7f468783f24d" },
    { start: 295262, end: 301262, shot: 3, still: "left" },
    { start: 301262, end: 307942, shot: 3, still: "right" },
    { start: 307942, end: 313459, shot: 4, attempt: "cd7eec78-d811-4e5a-bbc4-6fd54115cc72" },
    { start: 313459, end: 314023, shot: 3, still: "left" },
    { start: 314023, end: 322023, shot: 5, attempt: "a7298245-e1d4-4257-b19e-b34782651899" },
    { start: 322023, end: 327023, shot: 8, attempt: "e08c55cd-a05e-4632-bdb1-31df04c08d7d", crop: "scribe" },
    { start: 327023, end: 330023, shot: 8, still: "scribe" },
    { start: 330023, end: 336093, shot: 3, attempt: "223ca272-77e1-44ca-baea-7f468783f24d" },
    { start: 336093, end: 344093, shot: 6, attempt: "d9fc43d0-3ca9-4a0a-938e-3306da80f768" },
    { start: 344093, end: 349093, shot: 8, attempt: "e08c55cd-a05e-4632-bdb1-31df04c08d7d", crop: "scribe" },
    { start: 349093, end: 352093, shot: 8, still: "scribe" },
    { start: 352093, end: 357079, shot: 3, attempt: "223ca272-77e1-44ca-baea-7f468783f24d" },
    { start: 357079, end: 357645, shot: 3, still: "right" },
    { start: 357645, end: 364645, shot: 7, attempt: "03e5ba0e-c55e-4e7f-b0e1-eae111395996" },
    { start: 364645, end: 369645, shot: 8, attempt: "e08c55cd-a05e-4632-bdb1-31df04c08d7d", crop: "scribe" },
    { start: 369645, end: 371645, shot: 8, still: "scribe" }
  ] },
  5: { start: 371645, end: 429852, beats: [
    { start: 371645, end: 379645, shot: 1, attempt: "9f07286a-f97d-456a-90f2-a24bcee43a59" },
    { start: 379645, end: 387645, shot: 1, attempt: "6282cbf8-399d-4eb1-b2eb-a4f95afee2a2" },
    { start: 387645, end: 395645, shot: 1, still: "left" },
    { start: 395645, end: 399191, shot: 2, still: "right" },
    { start: 399191, end: 406000, shot: 2, attempt: "947ea098-dc5d-4dbf-99aa-f323f0e68f0c" },
    { start: 406000, end: 408000, shot: 3, still: "left" },
    { start: 408000, end: 413645, shot: 3, attempt: "3c332bf4-fcec-4f93-b68b-3e182487e837" },
    { start: 413645, end: 420645, shot: 4, attempt: "f2c7c6a4-6a6f-4889-b953-525f9950b869" },
    { start: 420645, end: 427645, shot: 4, attempt: "4be5f5c7-d769-4792-842a-383239ee8a4b" },
    { start: 427645, end: 429852, shot: 5, attempt: "ccbcd3b2-5b22-40b9-82c3-7ab54bf9bd36" }
  ] }
};
const run = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"], timeout: 180000 });
const seconds = (ms: number) => (ms / 1000).toFixed(3);
const requested = Number(process.argv[2]);
if (![3, 4, 5].includes(requested)) throw new Error("Usage: scene number 3, 4, or 5.");
const plan = plans[requested]!;
const shots = db.prepare("SELECT sh.id,sh.sequence FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? AND sc.sequence=? ORDER BY sh.sequence")
  .all(project, requested) as Array<{ id: string; sequence: number }>;
if (shots.length !== (requested === 3 ? 4 : requested === 4 ? 8 : 5) || shots.some((s, i) => s.sequence !== i + 1)) throw new Error("Planned shot order changed.");
if (plan.beats[0]!.start !== plan.start || plan.beats.at(-1)!.end !== plan.end || plan.beats.some((b, i) => b.start >= b.end || (i > 0 && plan.beats[i - 1]!.end !== b.start))) throw new Error("Picture beats do not exactly cover source scene.");
const source = db.prepare("SELECT source_path FROM audio_segments WHERE project_id=? AND layer='original_reading' AND start_ms=?")
  .get(project, plan.start) as { source_path: string } | undefined;
if (!source || !existsSync(join(root, source.source_path))) throw new Error("Original source recording missing.");
const work = mkdtempSync(join(tmpdir(), `heartword-mark3-scene${requested}-`));
try {
  const parts: string[] = [], manifest: Array<Beat & { path: string; normalizedPath: string; frames: number }> = [];
  for (const [i, beat] of plan.beats.entries()) {
    const shot = shots[beat.shot - 1];
    if (!shot) throw new Error(`Missing shot ${beat.shot}`);
    let path: string;
    if (beat.attempt) {
      const row = db.prepare("SELECT shot_id,status,result_asset_path FROM generation_attempts WHERE id=? AND operation IN ('generate_final_video','lip_sync')")
        .get(beat.attempt) as { shot_id: string; status: string; result_asset_path: string | null } | undefined;
      if (!row || row.shot_id !== shot.id || row.status !== "hold_for_review" || !row.result_asset_path) throw new Error(`Unreviewed or mismatched attempt ${beat.attempt}`);
      path = row.result_asset_path;
    } else {
      const row = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
        .get(shot.id) as { result_asset_path: string | null } | undefined;
      if (!row?.result_asset_path) throw new Error(`Missing approved still for shot ${beat.shot}`);
      path = row.result_asset_path;
    }
    const abs = join(root, path), part = join(work, `part-${String(i).padStart(2, "0")}.mp4`);
    if (!existsSync(abs)) throw new Error(`Missing picture ${abs}`);
    const frames = Math.round((beat.end - plan.start) * 24 / 1000) - Math.round((beat.start - plan.start) * 24 / 1000);
    if (beat.still === "scribe") {
      run(["-loop", "1", "-framerate", "24", "-i", abs, "-vf", "crop=600:338:0:170,scale=1280:720", "-frames:v", String(frames), "-an", "-c:v", "libx264", "-crf", "18", part]);
    } else if (beat.still) {
      const x = beat.still === "left" ? `(in_w-out_w)*n/${frames}` : `(in_w-out_w)*(1-n/${frames})`;
      run(["-loop", "1", "-framerate", "24", "-i", abs, "-vf", `scale=1408:792,crop=1280:720:x='${x}':y=36`, "-frames:v", String(frames), "-an", "-c:v", "libx264", "-crf", "18", part]);
    } else {
      const filter = beat.crop === "scribe" ? "crop=900:506:0:250,scale=1280:720,fps=24" : "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,tpad=stop_mode=clone:stop_duration=1";
      run(["-i", abs, "-an", "-vf", filter, "-frames:v", String(frames), "-c:v", "libx264", "-crf", "18", part]);
    }
    const normalizedPath = `generated/video/coverage/mark3-scene${requested}-beat${String(i + 1).padStart(2, "0")}-r${requested === 4 ? 2 : 1}.mp4`;
    mkdirSync(dirname(join(root, normalizedPath)), { recursive: true });
    copyFileSync(part, join(root, normalizedPath));
    parts.push(part);
    manifest.push({ ...beat, path, normalizedPath, frames });
  }
  const concatList = join(work, "picture.txt");
  writeFileSync(concatList, parts.map(p => `file '${p.replaceAll("\\", "/")}'`).join("\n"));
  const silent = join(work, "silent.mp4");
  run(["-f", "concat", "-safe", "0", "-i", concatList, "-c:v", "copy", silent]);
  const bindings = db.prepare(`SELECT ub.shot_id,ub.source_start_ms,ub.source_end_ms,ub.source_hash,m.source_hash AS mapped_hash,
      a.source_path,a.start_ms,a.end_ms
    FROM shot_utterance_bindings ub JOIN shots sh ON sh.id=ub.shot_id JOIN scenes sc ON sc.id=sh.scene_id
    JOIN composite_audio_source_map m ON m.original_segment_id=ub.source_audio_segment_id
    JOIN audio_segments a ON a.id=m.composite_segment_id AND a.project_id=sc.project_id AND a.layer='composite_cast_master'
    WHERE sc.project_id=? AND sc.sequence=? ORDER BY ub.source_start_ms`).all(project, requested) as Array<{
      shot_id: string; source_start_ms: number; source_end_ms: number; source_hash: string; mapped_hash: string;
      source_path: string; start_ms: number; end_ms: number;
    }>;
  if (bindings.length !== (requested === 3 ? 1 : 4)) throw new Error("Expected source-locked speaking lines changed.");
  const audioInputs = [join(root, source.source_path), ...bindings.map(b => join(root, b.source_path))];
  const filters: string[] = [], labels: string[] = [];
  let cursor = plan.start;
  for (const [i, b] of bindings.entries()) {
    if (b.source_hash !== b.mapped_hash || b.source_start_ms < cursor || b.source_end_ms > plan.end || !existsSync(audioInputs[i + 1]!)) throw new Error("Composite cast mapping or source range changed.");
    if (cursor < b.source_start_ms) {
      const label = `o${i}`;
      filters.push(`[1:a]atrim=start=${seconds(cursor)}:end=${seconds(b.source_start_ms)},asetpts=PTS-STARTPTS,aresample=48000[${label}]`);
      labels.push(`[${label}]`);
    }
    const duration = b.source_end_ms - b.source_start_ms, label = `c${i}`;
    filters.push(`[${i + 2}:a]atrim=start=${seconds(b.start_ms)}:end=${seconds(b.end_ms)},asetpts=PTS-STARTPTS,aresample=48000,apad,atrim=duration=${seconds(duration)}[${label}]`);
    labels.push(`[${label}]`);
    cursor = b.source_end_ms;
  }
  if (cursor < plan.end) {
    filters.push(`[1:a]atrim=start=${seconds(cursor)}:end=${seconds(plan.end)},asetpts=PTS-STARTPTS,aresample=48000[tail]`);
    labels.push("[tail]");
  }
  filters.push(`${labels.join("")}concat=n=${labels.length}:v=0:a=1[a]`);
  const output = join(root, `generated/video/review/mark3-scene${requested}-full-source-review-r${requested === 4 ? 2 : 1}.mp4`);
  mkdirSync(dirname(output), { recursive: true });
  run(["-i", silent, ...audioInputs.flatMap(p => ["-i", p]), "-filter_complex", filters.join(";"), "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", seconds(plan.end - plan.start), "-movflags", "+faststart", output]);
  writeFileSync(output.replace(/\.mp4$/, ".json"), JSON.stringify({ scene: requested, sourceStartMs: plan.start, sourceEndMs: plan.end, picture: manifest, cast: bindings.map(b => ({ shotId: b.shot_id, startMs: b.source_start_ms, endMs: b.source_end_ms, path: b.source_path })) }, null, 2));
  console.log(JSON.stringify({ scene: requested, output, durationMs: plan.end - plan.start, beats: manifest.length }));
} finally { rmSync(work, { recursive: true, force: true }); }
