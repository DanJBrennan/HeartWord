/**
 * Creates exactly four silent base-motion clips for the producer-approved
 * Mark 4 storm speaker keyframes.  These are deliberately held for review;
 * the face-targeted audio pass is a separate, explicit step after Kling has
 * returned real face IDs.  This script never invokes chapter-wide media or
 * voicing stages.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const takes = [
  {
    shotId: "6db6f5f1-ced4-4675-82f4-05c772333d01",
    speaker: "Peter",
    frame: "generated/keyframes/codex/6db6f5f1-ced4-4675-82f4-05c772333d01/mark4-storm-speaker-coverage-exec-be3acf60-847b-416e-a0ac-3c885d8ed72a.png",
    prompt: "Hold the approved storm-boat composition. Peter remains the only readable foreground speaking face; he braces against the wind with natural breath, small eye and head movement, and a neutral resting mouth for later audio-driven lip sync. Jesus stays asleep and unfocused in the background. Waves and rain move naturally. No invented speech, no audible dialogue, no new people, no camera move, no wardrobe or identity change."
  },
  {
    shotId: "c02b7bd2-d16d-4163-b7a0-88f32ae3e1dd",
    speaker: "Jesus command",
    frame: "generated/keyframes/codex/c02b7bd2-d16d-4163-b7a0-88f32ae3e1dd/mark4-storm-speaker-coverage-exec-e52c967a-938a-451b-9f09-78860ab71a65.png",
    prompt: "Hold the approved storm-boat composition. Jesus is the only readable foreground speaking face, facing the storm with subtle breathing, eye and head movement, and a neutral resting mouth for later audio-driven lip sync. Supporting disciples remain background and do not visibly speak. Rain, wind, water and cloth move naturally. No invented speech, no audible dialogue, no new people, no camera move, no wardrobe or identity change."
  },
  {
    shotId: "89ba4fb7-5e0a-4049-b4f2-6ec9fc778d64",
    speaker: "Jesus question, first beat",
    frame: "generated/keyframes/codex/89ba4fb7-5e0a-4049-b4f2-6ec9fc778d64/mark4-storm-speaker-coverage-exec-5b3823af-3632-4da5-af6b-0b14ba36ce0e.png",
    prompt: "Hold the approved calm-after-storm boat composition. Jesus is the only readable foreground speaking face, with subtle breathing, attentive eye and head movement, and a neutral resting mouth for later audio-driven lip sync. The disciples listen quietly with mouths not visibly speaking. The boat and water move gently. No invented speech, no audible dialogue, no new people, no camera move, no wardrobe or identity change."
  },
  {
    shotId: "404d00a7-a0c5-4d64-ae50-281e60f93302",
    speaker: "Jesus question, second beat",
    frame: "generated/keyframes/codex/404d00a7-a0c5-4d64-ae50-281e60f93302/mark4-storm-speaker-coverage-exec-99499c29-f118-48ca-bda2-1c9d7fd8c196.png",
    prompt: "Hold the approved three-quarter calm-after-storm boat composition. Jesus is the only readable foreground speaking face, with subtle breathing, reflective eye and head movement, and a neutral resting mouth for later audio-driven lip sync. The listening disciples remain quiet and do not visibly speak. Gentle water and boat movement only. No invented speech, no audible dialogue, no new people, no camera move, no wardrobe or identity change."
  }
] as const;

const db = getDb();
const dataDir = getDataDir();

function durationMs(path: string): number {
  return Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], { encoding: "utf8" }).trim()) * 1000);
}

async function main() {
  const provider = new KlingFaceLipSyncProvider();
  const output = [];
  for (const take of takes) {
    const binding = db.prepare(`SELECT ub.id
      FROM shot_utterance_bindings ub
      JOIN composite_audio_source_map map ON map.original_segment_id=ub.source_audio_segment_id
      JOIN audio_segments composite ON composite.id=map.composite_segment_id
      WHERE ub.shot_id=? AND composite.project_id=? AND composite.layer='composite_cast_master'`).get(take.shotId, projectId);
    if (!binding) throw Error(`${take.speaker} has no scoped composite-audio binding.`);
    const prior = db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_coverage_base' AND status='hold_for_review' ORDER BY created_at DESC LIMIT 1").get(take.shotId) as { id: string; result_asset_path: string } | undefined;
    if (prior && existsSync(join(dataDir, "assets", prior.result_asset_path))) {
      output.push({ speaker: take.speaker, baseAttemptId: prior.id, path: prior.result_asset_path, reused: true });
      continue;
    }
    if (!existsSync(join(dataDir, "assets", take.frame))) throw Error(`Approved keyframe missing for ${take.speaker}.`);
    const { taskId, videoUrl } = await provider.generateSceneVideo({ path: take.frame }, take.prompt, 5);
    const response = await fetch(videoUrl);
    if (!response.ok) throw Error(`Kling base download failed for ${take.speaker}: ${response.status}`);
    const rel = join("generated", "video", `mark4-storm-lipsync-base-${taskId}.mp4`);
    const full = join(dataDir, "assets", rel);
    mkdirSync(join(dataDir, "assets", "generated", "video"), { recursive: true });
    writeFileSync(full, Buffer.from(await response.arrayBuffer()), { flag: "wx" });
    const actualMs = durationMs(full);
    if (actualMs < 3000) throw Error(`Kling base for ${take.speaker} is too short: ${actualMs} ms.`);
    const attemptId = randomUUID(); const now = Date.now();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'kling','kling-v2-6-pro','generate_coverage_base','720p',?,'hold_for_review',?,?,?)")
        .run(attemptId, take.shotId, take.prompt, rel, 0.6, now);
      db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
        .run(randomUUID(), projectId, attemptId, 0.6, now);
      db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
        .run(randomUUID(), projectId, take.shotId, `${take.speaker} has a silent base-motion candidate held for face identification and source-bound lip-sync.`, now);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    output.push({ speaker: take.speaker, baseAttemptId: attemptId, taskId, path: rel, durationMs: actualMs, reused: false });
  }
  console.log(JSON.stringify(output, null, 2));
}
main().catch((error) => { console.error("FAILED:", error); process.exitCode = 1; });
