/**
 * Applies Dan's source-led, three-clip pilot decision for Mark 4:11.
 *
 * The four approved coverage keyframes remain retained as the broader
 * chapter plan.  This bounded pilot deliberately selects only the opening
 * master and the two Jesus inserts, cutting at acoustic pause midpoints
 * nearest one-third and two-thirds of the exact source line.  It prepares
 * the single source interval's normal scoped cast audio, but never starts
 * base-motion, lip-sync, or chapter-wide media work.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { runVoicing } from "../src/pipeline/voicing/index.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const shotId = "17246352-3c8d-498a-b99e-47c70ff89d2a";
const sourceId = "95b36a21-021d-4ca3-b1d8-c1f5f1569f67";
// Centers of the detected source pauses 3.309375–3.577583 and
// 8.301958–8.530750 seconds, chosen for balanced three-part coverage.
const cuts = [3443, 8416] as const;
const selectedBeatIds = [
  "e3ab722f-0fb3-4397-8b7c-b05bb0861a65", // opening master
  "8647e349-5f4a-4679-a194-bcb3239abf96", // first Jesus insert
  "6f53ae2d-8db9-4c7a-a143-a86c2ad956c7"  // final Jesus insert
] as const;

const db = getDb(), dataDir = getDataDir();
const source = db.prepare("SELECT start_ms,end_ms,source_path,speaker_character_id FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'")
  .get(sourceId, projectId) as { start_ms:number; end_ms:number; source_path:string; speaker_character_id:string | null } | undefined;
if (!source || source.start_ms !== 133062 || source.end_ms !== 144130 || !source.speaker_character_id) throw Error("Mark 4:11 exact Jesus source interval is unavailable.");

const beats = selectedBeatIds.map((id) => {
  const beat = db.prepare("SELECT id,sequence,beat_type,needs_lip_sync,keyframe_asset_path,status FROM coverage_beats WHERE id=? AND shot_id=?")
    .get(id, shotId) as { id:string; sequence:number; beat_type:string; needs_lip_sync:number; keyframe_asset_path:string | null; status:string } | undefined;
  if (!beat || beat.status !== "accepted" || !beat.keyframe_asset_path) throw Error(`Approved Mark 4:11 keyframe is unavailable for ${id}.`);
  return beat;
});
if (beats[0]!.beat_type !== "master" || beats[1]!.needs_lip_sync !== 1 || beats[2]!.needs_lip_sync !== 1) throw Error("The selected three-shot pilot no longer matches the approved coverage roles.");

const segments = [
  { sequence:1, sourceStartMs:0, sourceEndMs:cuts[0], coverageBeatId:beats[0]!.id, role:"opening master" },
  { sequence:2, sourceStartMs:cuts[0], sourceEndMs:cuts[1], coverageBeatId:beats[1]!.id, role:"first Jesus insert" },
  { sequence:3, sourceStartMs:cuts[1], sourceEndMs:source.end_ms-source.start_ms, coverageBeatId:beats[2]!.id, role:"final Jesus insert" }
];
if (segments.some((segment, index) => segment.sourceEndMs <= segment.sourceStartMs || (index > 0 && segment.sourceStartMs !== segments[index - 1]!.sourceEndMs))) throw Error("The Mark 4:11 pilot cuts are not contiguous.");

const note = `Dan Brennan approved an automated three-clip Mark 4:11 pilot: preserve the full Jesus source line, use acoustic-pause midpoint cuts at 3443 ms and 8416 ms, and select approved coverage keyframes ${selectedBeatIds.join(", ")}. The retained listener-reaction keyframe is not part of this pilot; no chapter-wide media is authorized.`;
if (!db.prepare("SELECT id FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND source='human' AND note=?").get(projectId, shotId, note)) {
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,?,?, 'human', ?,1,?)")
    .run(randomUUID(), projectId, "shot", shotId, note, Date.now());
}

const voiced = await runVoicing(projectId, { sourceSegmentIds:[sourceId] });
const outDir = join(dataDir, "assets", "generated", "pilot-source");
mkdirSync(outDir, { recursive:true });
const manifestPath = join(outDir, "mark4-v11-three-clip-pilot.json");
writeFileSync(manifestPath, JSON.stringify({
  purpose:"Dan-approved held Mark 4:11 three-clip pilot; not a chapter media run.",
  originalSource:{ id:sourceId, path:source.source_path, startMs:source.start_ms, endMs:source.end_ms },
  cutsMs:cuts,
  segments,
  selectedKeyframes:beats.map((beat) => ({ coverageBeatId:beat.id, sequence:beat.sequence, path:beat.keyframe_asset_path })),
  castAudioPrepared:true
}, null, 2));
console.log(JSON.stringify({ sourceDurationMs:source.end_ms-source.start_ms, cutsMs:cuts, segments, voiced, manifestPath }, null, 2));
