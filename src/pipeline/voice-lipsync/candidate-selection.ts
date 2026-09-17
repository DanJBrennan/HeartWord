import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

/** Explicit producer selection. A returned provider candidate has no timeline
 * authority until this action; retrying afterwards reuses the selected clip. */
export function acceptLipSyncCandidate(db: DatabaseSync, projectId: string, attemptId: string): { clipId:string; reused:boolean } {
  const attempt=db.prepare(`SELECT ga.id,ga.shot_id,ga.status,ga.result_asset_path,b.source_end_ms-b.source_start_ms duration_ms FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id JOIN shot_utterance_bindings b ON b.shot_id=sh.id WHERE ga.id=? AND sc.project_id=? AND ga.operation='lip_sync'`).get(attemptId,projectId) as {id:string;shot_id:string;status:string;result_asset_path:string|null;duration_ms:number}|undefined;
  if (!attempt || !attempt.result_asset_path) throw new Error("Lip-sync candidate is not retained in this project.");
  const existing=db.prepare("SELECT id FROM clips WHERE generation_attempt_id=?").get(attemptId) as {id:string}|undefined;
  if (existing) return {clipId:existing.id,reused:true};
  if (attempt.status !== "hold_for_review" && attempt.status !== "accepted") throw new Error("Only a held lip-sync candidate can be accepted.");
  const clipId=randomUUID(), now=Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=? AND status='hold_for_review'").run(attemptId);
    db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,?,?)").run(clipId,attempt.shot_id,attemptId,attempt.duration_ms,now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'human',?,1,?)").run(randomUUID(),projectId,attempt.shot_id,`Producer accepted lip-sync candidate ${attemptId}.`,now);
    db.exec("COMMIT");
  } catch(error) { db.exec("ROLLBACK"); throw error; }
  return {clipId,reused:false};
}
