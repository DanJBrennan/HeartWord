/**
 * Materialize the producer-approved v34 canonical-Jesus performance excerpts.
 *
 * Each output is a held, exact source-clock cast-audio excerpt. A requested
 * beat may cross existing alignment rows; those rows are concatenated with
 * only their real source-clock gaps. This keeps reviewed cast audio usable
 * without weakening the single-segment utterance-binding invariant.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir(), assets = join(dataDir, "assets"), db = getDb();
const outputDirRel = "generated/pilot-source/mark4-v34-canonical-performances";
const outputDir = join(assets, outputDirRel);
const candidates: Array<[string, string, number, number, string]> = [
  ["3-8-beat-1", "Mark 4:3–8", 55000, 59500, "mark4-3-8-beat-1-boat-keyframe.png"],
  ["3-8-beat-2", "Mark 4:3–8", 75500, 80000, "mark4-3-8-beat-2-boat-keyframe.png"],
  ["3-8-beat-3", "Mark 4:3–8", 98800, 103308, "mark4-3-8-beat-3-boat-keyframe.png"],
  ["14-20-beat-1", "Mark 4:14–20", 195500, 200000, "mark4-14-20-beat-1-hillside-keyframe.png"],
  ["14-20-beat-2", "Mark 4:14–20", 215500, 220000, "mark4-14-20-beat-2-hillside-keyframe.png"],
  ["14-20-beat-3", "Mark 4:14–20", 235500, 240000, "mark4-14-20-beat-3-hillside-keyframe.png"],
  ["14-20-beat-4", "Mark 4:14–20", 254200, 258679, "mark4-14-20-beat-4-hillside-keyframe.png"],
  ["21-25-beat-1", "Mark 4:21–25", 284700, 289148, "mark4-21-25-beat-1-shore-keyframe.png"],
  ["21-25-beat-2", "Mark 4:21–25", 296600, 301142, "mark4-21-25-beat-2-shore-keyframe.png"],
  ["21-25-beat-3", "Mark 4:21–25", 302300, 306801, "mark4-21-25-beat-3-shore-keyframe.png"],
  ["26-29-beat-1", "Mark 4:26–29", 333000, 337500, "mark4-26-29-beat-1-field-keyframe.png"],
  ["26-29-beat-2", "Mark 4:26–29", 348000, 352500, "mark4-26-29-beat-2-field-keyframe.png"],
  ["26-29-beat-3", "Mark 4:26–29", 353800, 358269, "mark4-26-29-beat-3-field-keyframe.png"],
  ["30-32-beat-1", "Mark 4:30–32", 377300, 381800, "mark4-30-32-beat-1-mustard-keyframe.png"],
  ["30-32-beat-2", "Mark 4:30–32", 391700, 396232, "mark4-30-32-beat-2-mustard-keyframe.png"]
];
type SourceRow = { id: string; start_ms: number; end_ms: number; speaker_character_id: string | null; composite_start: number; composite_end: number; composite_path: string | null };
const jesus = db.prepare("SELECT id FROM characters WHERE name='Jesus' AND canon_status='approved'").get() as { id: string } | undefined;
if (!jesus) throw new Error("Approved Jesus canon is required.");
const keyframeDirRel = "generated/review/mark4-v34-performance-candidates";
const sceneForPassage: Record<string, string> = {
  "Mark 4:3–8": "0f61e2d0-eaf2-4d71-a34b-09077242c07c",
  "Mark 4:14–20": "1e47ecf3-db86-4abf-9ef8-61b2928862c2",
  "Mark 4:21–25": "4647ec53-e99c-4399-a266-5f3d63a2fa8c",
  "Mark 4:26–29": "777c13a8-ec07-4c67-91e8-ad3fc3541f53",
  "Mark 4:30–32": "1b338830-b5dc-4d1a-a55c-4571ee52cfb7"
};
const note = "Dan Brennan approved all fifteen held canonical Jesus keyframes for the next held motion/lip-sync review stage; no chapter placement is authorized.";
if (!db.prepare("SELECT id FROM review_notes WHERE project_id=? AND subject_type='project' AND subject_id=? AND source='human' AND note=?").get(projectId, projectId, note)) {
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,?,?, 'human', ?,0,?)")
    .run(randomUUID(), projectId, "project", projectId, note, Date.now());
}
mkdirSync(outputDir, { recursive: true });
const prepared: Array<Record<string, unknown>> = [];
for (const [candidateIndex, [key, passage, startMs, endMs, imageName]] of candidates.entries()) {
  const keyframePath = `${keyframeDirRel}/${imageName}`;
  if (!existsSync(join(assets, keyframePath))) throw new Error(`Missing approved keyframe for ${key}.`);
  const rows = db.prepare(`SELECT original.id,original.start_ms,original.end_ms,original.speaker_character_id,
      composite.start_ms composite_start,composite.end_ms composite_end,composite.source_path composite_path
    FROM audio_segments original
    JOIN composite_audio_source_map map ON map.original_segment_id=original.id
    JOIN audio_segments composite ON composite.id=map.composite_segment_id AND composite.layer='composite_cast_master'
    WHERE original.project_id=? AND original.layer='original_reading' AND original.end_ms>? AND original.start_ms<?
    ORDER BY original.start_ms`).all(projectId, startMs, endMs) as SourceRow[];
  if (!rows.length || rows.some(row => row.speaker_character_id !== jesus.id || !row.composite_path || !existsSync(join(assets, row.composite_path)))) {
    throw new Error(`${key} cannot be prepared from approved Jesus cast-audio provenance.`);
  }
  const inputPaths: string[] = [], filters: string[] = [], labels: string[] = [];
  let cursor = startMs;
  for (const row of rows) {
    const overlapStart = Math.max(cursor, row.start_ms), overlapEnd = Math.min(endMs, row.end_ms);
    if (overlapEnd <= overlapStart) continue;
    if (overlapStart > cursor) {
      const gap = (overlapStart - cursor) / 1000;
      const label = `p${labels.length}`;
      filters.push(`anullsrc=r=48000:cl=stereo:d=${gap.toFixed(6)}[${label}]`); labels.push(label);
    }
    const scale = (row.composite_end - row.composite_start) / (row.end_ms - row.start_ms);
    const compositeStart = (row.composite_start + (overlapStart - row.start_ms) * scale) / 1000;
    const compositeEnd = (row.composite_start + (overlapEnd - row.start_ms) * scale) / 1000;
    const index = inputPaths.length; inputPaths.push(row.composite_path!);
    const label = `p${labels.length}`;
    filters.push(`[${index}:a]atrim=start=${compositeStart.toFixed(6)}:end=${compositeEnd.toFixed(6)},asetpts=PTS-STARTPTS,aresample=48000[${label}]`); labels.push(label);
    cursor = overlapEnd;
  }
  if (cursor < endMs) {
    const label = `p${labels.length}`;
    filters.push(`anullsrc=r=48000:cl=stereo:d=${((endMs - cursor) / 1000).toFixed(6)}[${label}]`); labels.push(label);
  }
  filters.push(`${labels.map(label => `[${label}]`).join("")}concat=n=${labels.length}:v=0:a=1[audio]`);
  const outputRel = `${outputDirRel}/${key}.wav`, output = join(assets, outputRel);
  execFileSync("ffmpeg", ["-v", "error", "-y", ...inputPaths.flatMap(path => ["-i", join(assets, path)]), "-filter_complex", filters.join(";"), "-map", "[audio]", "-c:a", "pcm_s16le", output], { stdio: "inherit" });
  const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", output], { encoding: "utf8" }).trim()) * 1000);
  if (Math.abs(durationMs - (endMs - startMs)) > 20) throw new Error(`${key} duration drifted to ${durationMs}ms.`);
  const continuity = `CANONICAL_JESUS_PERFORMANCE_${key}; producer-approved keyframe and exact cast-audio excerpt. Held motion/lip-sync review only; no chapter placement.`;
  const existing = db.prepare("SELECT id FROM shots WHERE continuity_notes=?").get(continuity) as { id: string } | undefined;
  const shotId = existing?.id ?? randomUUID();
  if (!existing) {
    db.prepare(`INSERT INTO shots (id,scene_id,sequence,action,verse_ref,framing,camera_movement,needs_lip_sync,dialogue_character_id,coverage_plan,continuity_notes,status,created_at)
      VALUES (?,?,?,?,?,'medium_close','static',1,?,'single_clip',?,'hold_for_review',?)`)
      .run(shotId, sceneForPassage[passage]!, 1000 + candidateIndex, `Source-bound canonical Jesus performance candidate for ${passage}.`, passage, jesus.id, continuity, Date.now());
    db.prepare("INSERT OR IGNORE INTO shot_characters (shot_id,character_id) VALUES (?,?)").run(shotId, jesus.id);
  }
  prepared.push({ key, shotId, passage, startMs, endMs, keyframePath, audioPath: outputRel, sourceRows: rows.map(({ id, start_ms, end_ms }) => ({ id, startMs: start_ms, endMs: end_ms })), durationMs });
}
const manifest = join(outputDir, "manifest.json");
writeFileSync(manifest, JSON.stringify({ purpose: "Producer-approved v34 canonical Jesus motion/lip-sync candidates; held review only, never a chapter placement.", approvedBy: "Dan Brennan", prepared }, null, 2));
console.log(JSON.stringify({ manifest, prepared: prepared.map(item => ({ key: item.key, durationMs: item.durationMs })) }, null, 2));
