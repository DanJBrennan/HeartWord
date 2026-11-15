/** Producer-confirmed, idempotent Mark 3:4 boundary and timeline reconciliation. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { recordBoundaryOverride } from "../src/pipeline/ingestion/boundary-overrides.js";
import { attestSourceAlignment } from "../src/pipeline/ingestion/source-review.js";
import { acceptCoveredLipSyncCandidate } from "../src/pipeline/voice-lipsync/candidate-selection.js";
import { acceptFinalVideoCandidate } from "../src/pipeline/media-generation/final-video.js";
import { assembleCoveredSequenceShot } from "../src/pipeline/assembly/assemble-covered-shot.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const shot4 = "0e456bc8-a7fd-4dd2-877c-32b0b0d661b5";
const shot5 = "b78f8ac2-508b-4526-b50e-e57323579e54";
const jesusSource = "6563e2f8-0088-4c75-bd96-bfa8769e654c";
const narratorSource = "88716534-1812-4262-b7ef-71d880575796";
const compositeId = "9024ecee-1e8d-4a8d-8275-be77ce2900ce";
const bindingId = "ad7e9096-372c-4bed-ac0f-f963193c77ed";
const beat3 = "11be771b-5bdc-4bb5-a45e-bf0e90e85c6f";
const commandKey = "mark3-scene1-shot4-shot5-boundary-55153-v1";
const revisedEdgeMs = 55153;
const oldEdgeMs = 55733;
const jesusDurationMs = revisedEdgeMs - 41733;
const narratorDurationMs = 57990 - revisedEdgeMs;
const castRel = "generated/hatam/mark-3/composite_cast_master/06-mark-3-4-elevenlabs-boundary-55153.wav";
const evidence = "Dan confirmed this 55.153 s revision after review of the Shot 4→5 transition. The original recording has a quiet gap at 54.753–55.553 s; its midpoint moves the old 55.733 s edge before the onset of Dan-attributed narration, ‘But they were silent.’ Jesus cast audio is retained through 13.420 s, narration through 57.990 s, and the combined 16.257 s span is unchanged.";

type Segment = { id:string; project_id:string; layer:string; source_path:string; start_ms:number; end_ms:number; speaker_character_id:string|null; confidence:number|null };
const db = getDb();
const assets = join(getDataDir(), "assets");
const command = () => db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND idempotency_key=?").get(projectId, commandKey);
const row = <T>(sql:string, ...params:Array<string|number>): T => {
  const result = db.prepare(sql).get(...params) as T|undefined;
  if (!result) throw new Error(`Missing required record: ${sql}`);
  return result;
};
const ensure = (condition:unknown, message:string): void => { if (!condition) throw new Error(message); };

function applyRevision(): void {
  if (command()) return;
  const left = row<Segment>("SELECT * FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'", jesusSource, projectId);
  const right = row<Segment>("SELECT * FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'", narratorSource, projectId);
  const binding = row<Record<string,unknown>>("SELECT * FROM shot_utterance_bindings WHERE id=? AND shot_id=?", bindingId, shot4);
  const composite = row<Segment>("SELECT * FROM audio_segments WHERE id=? AND project_id=? AND layer='composite_cast_master'", compositeId, projectId);
  const coverage = row<Record<string,unknown>>("SELECT * FROM coverage_beats WHERE id=? AND shot_id=?", beat3, shot4);
  const map = row<{ source_hash:string }>("SELECT source_hash FROM composite_audio_source_map WHERE composite_segment_id=? AND original_segment_id=?", compositeId, jesusSource);
  ensure(left.start_ms===41733 && left.end_ms===oldEdgeMs && right.start_ms===oldEdgeMs && right.end_ms===57990, "Approved source boundaries changed; refusing stale revision.");
  ensure(left.source_path===right.source_path && left.speaker_character_id && right.speaker_character_id===null, "Source recording or speaker identity changed.");
  ensure(binding.source_start_ms===41733 && binding.source_end_ms===oldEdgeMs && binding.source_audio_segment_id===jesusSource && binding.approved_by==="Dan", "Producer-approved binding changed.");
  ensure(composite.start_ms===0 && composite.end_ms===13978 && map.source_hash===binding.source_hash, "Cast master or its source map changed.");
  ensure(coverage.audio_start_ms===10053 && coverage.audio_end_ms===14000 && coverage.status==="accepted", "Approved coverage timing changed.");
  ensure(db.prepare("SELECT COUNT(*) AS n FROM clips WHERE shot_id IN (?,?)").get(shot4,shot5)!.n===0, "Shot 4/5 already have selected clips; reconcile those first.");
  const sourceAbs = join(assets, left.source_path);
  ensure(existsSync(sourceAbs) && createHash("sha256").update(readFileSync(sourceAbs)).digest("hex")===binding.source_hash, "Bound original audio changed.");
  const oldCastAbs = join(assets, composite.source_path);
  const newCastAbs = join(assets, castRel);
  ensure(existsSync(oldCastAbs), "Cast-master source audio is missing.");
  if (!existsSync(newCastAbs)) {
    execFileSync("ffmpeg", ["-v","error","-i",oldCastAbs,"-t","13.420","-ar","48000","-ac","1","-c:a","pcm_s16le",newCastAbs]);
  }
  const duration = Number(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",newCastAbs], { encoding:"utf8" }).trim());
  ensure(Math.abs(duration-13.420)<0.005, "Trimmed cast master has the wrong duration.");

  const before = { left, right, binding, composite, coverage };
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    recordBoundaryOverride(db,{projectId,segmentId:jesusSource,startMs:41733,endMs:revisedEdgeMs,reviewerName:"Dan",evidence});
    recordBoundaryOverride(db,{projectId,segmentId:narratorSource,startMs:revisedEdgeMs,endMs:57990,reviewerName:"Dan",evidence});
    db.prepare("UPDATE audio_segments SET confidence=MIN(COALESCE(confidence,89),89) WHERE id IN (?,?)").run(jesusSource,narratorSource);
    db.prepare("UPDATE shot_utterance_bindings SET source_end_ms=?,approved_at=?,approved_by='Dan' WHERE id=?").run(revisedEdgeMs,now,bindingId);
    db.prepare("UPDATE audio_segments SET source_path=?,end_ms=? WHERE id=?").run(castRel,jesusDurationMs,compositeId);
    db.prepare("UPDATE coverage_beats SET audio_end_ms=? WHERE id=?").run(jesusDurationMs,beat3);
    const reviewId=attestSourceAlignment(db,{projectId,reviewerName:"Dan",attestation:"I confirm that you may record a revised boundary.",evidence});
    const sequence=Number(row<{n:number}>("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?",projectId).n);
    db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at,undone) VALUES (?,?,?,?,?,?,?,0)").run(randomUUID(),projectId,sequence,"revise_source_boundary",JSON.stringify({before,after:{edgeMs:revisedEdgeMs,jesusDurationMs,narratorDurationMs,castRel},reviewId,approvedBy:"Dan",evidence}),commandKey,now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'human',?,1,?)").run(randomUUID(),projectId,shot4,`Dan-approved source-boundary revision ${oldEdgeMs}→${revisedEdgeMs} ms. Prior segment/binding/composite/coverage values retained in edit command ${commandKey}. New alignment attestation ${reviewId}.`,now);
    db.exec("COMMIT");
  } catch(error) { db.exec("ROLLBACK"); throw error; }
}

function acceptCutaway(): void {
  const attemptId="21eaa05d-100d-4ab9-8e98-1a31264ad914";
  if (db.prepare("SELECT id FROM clips WHERE generation_attempt_id=?").get(attemptId)) return;
  const attempt=row<{status:string;result_asset_path:string}>("SELECT status,result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_coverage_base'",attemptId,shot4);
  ensure(attempt.status==="hold_for_review" && existsSync(join(assets,attempt.result_asset_path)),"Cutaway is not a retained, held candidate.");
  const now=Date.now();db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=?").run(attemptId);
    db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,?,?,?)").run(randomUUID(),shot4,attemptId,6755,10053,now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'human',?,1,?)").run(randomUUID(),projectId,shot4,`Dan-approved Shot 4 covered sequence: selected cutaway ${attemptId} for 6755–10053 ms.`,now);
    db.exec("COMMIT");
  } catch(error) {db.exec("ROLLBACK");throw error;}
}

function assembleIfMissing(shotId:string, kind:"covered"|"single"): void {
  const existing=db.prepare("SELECT ga.result_asset_path FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id WHERE c.shot_id=? AND ga.operation='assemble_shot'").get(shotId) as {result_asset_path:string}|undefined;
  if (existing) {ensure(existsSync(join(assets,existing.result_asset_path)),"Recorded assembly output is missing.");return;}
  if(kind==="covered") assembleCoveredSequenceShot(db,shotId);
  else assembleSingleShot(db,shotId);
}

applyRevision();
acceptCoveredLipSyncCandidate(db,projectId,"1d984bad-1454-4ab4-830d-cd39ad48f384","eda1f4e4-560e-48ae-9288-9c70be49c110");
acceptCutaway();
acceptCoveredLipSyncCandidate(db,projectId,"4b75c912-7a5d-4546-b1f3-9fb0c35c24aa",beat3);
acceptFinalVideoCandidate(db,projectId,"aeb84524-f27d-43a5-b8b3-ce30328477dc",narratorDurationMs);
assembleIfMissing(shot4,"covered");
assembleIfMissing(shot5,"single");
console.log(JSON.stringify({edgeMs:revisedEdgeMs,jesusDurationMs,narratorDurationMs,commandKey,shot4,shot5}));
