import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import { readConfirmedSpeechRuns } from "../ingestion/continuous-speech.js";

export interface UtteranceBinding { id:string; shotId:string; sourceSegmentId:string; startMs:number; endMs:number; characterVersionId:string; sourceHash:string; }
const hashFile = (path:string) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Explicit producer action. It refuses narrator segments, foreign shots,
 * wrong voices and intervals outside the approved source segment. */
export function bindShotUtterance(db: DatabaseSync, input: { projectId:string; shotId:string; sourceSegmentId:string; startMs:number; endMs:number; characterVersionId:string; approvedBy:string; speechRunId?: string; timingEvidence?: string }): UtteranceBinding {
  const shot=db.prepare(`SELECT sh.dialogue_character_id characterId FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=? AND sc.project_id=? AND sh.needs_lip_sync=1`).get(input.shotId,input.projectId) as {characterId:string}|undefined;
  const source=db.prepare(`SELECT id,source_path,start_ms,end_ms,speaker_character_id speakerId FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'`).get(input.sourceSegmentId,input.projectId) as {id:string;source_path:string;start_ms:number;end_ms:number;speakerId:string|null}|undefined;
  const version=db.prepare(`SELECT id FROM character_versions WHERE id=? AND character_id=? AND status='approved'`).get(input.characterVersionId,shot ? shot.characterId : "") as {id:string}|undefined;
  const runs = readConfirmedSpeechRuns(db, input.projectId);
  const run = input.speechRunId ? runs.find(r => r.id === input.speechRunId) : undefined;
  if (input.speechRunId && (!run || run.characterId !== shot?.characterId || !run.members.some(m => m.id === input.sourceSegmentId))) throw new Error("Utterance must belong to the confirmed speech and matched speaker.");
  const containingRun = run ?? runs.find(r => r.members.some(m => m.id === input.sourceSegmentId));
  if (containingRun && !input.timingEvidence?.trim()) throw new Error("An exact generation/performance window needs independent timing evidence; broad speech attribution does not align a phrase or emotional beat.");
  if (!shot || !source || !version || !source.speakerId || source.speakerId!==shot.characterId || !input.approvedBy.trim() || !Number.isInteger(input.startMs) || !Number.isInteger(input.endMs) || input.startMs<(run?.startMs ?? source.start_ms) || input.endMs>(run?.endMs ?? source.end_ms) || input.endMs<=input.startMs) throw new Error("Utterance binding must be a producer-approved speaking interval inside its matched original source segment.");
  const path=join(getDataDir(),"assets",source.source_path); if (!existsSync(path)) throw new Error("Bound source audio file is missing.");
  const binding:UtteranceBinding={id:randomUUID(),shotId:input.shotId,sourceSegmentId:source.id,startMs:input.startMs,endMs:input.endMs,characterVersionId:input.characterVersionId,sourceHash:hashFile(path)};
  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare(`INSERT INTO shot_utterance_bindings (id,shot_id,source_audio_segment_id,source_start_ms,source_end_ms,character_version_id,source_hash,approved_at,approved_by) VALUES (?,?,?,?,?,?,?,?,?)`).run(binding.id,binding.shotId,binding.sourceSegmentId,binding.startMs,binding.endMs,binding.characterVersionId,binding.sourceHash,Date.now(),input.approvedBy.trim());
    if (containingRun) {
      const sequence = Number(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(input.projectId)!.n);
      db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES (?,?,?,'bind_speech_run_utterance',?,?,?)")
        .run(randomUUID(), input.projectId, sequence, JSON.stringify({ binding, speechRunId: containingRun.id, timingEvidence: input.timingEvidence, approvedBy: input.approvedBy }), `speech-binding:${binding.id}`, Date.now());
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return binding;
}
