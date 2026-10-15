import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import { validateAttemptRevision, recordMediaAcceptance } from "../creative-direction/crew-store.js";

/** Explicit producer selection. A returned provider candidate has no timeline
 * authority until this action; retrying afterwards reuses the selected clip. */
export function acceptLipSyncCandidate(db: DatabaseSync, projectId: string, attemptId: string): { clipId:string; reused:boolean } {
  const attempt=db.prepare(`SELECT ga.id,ga.shot_id,ga.status,ga.result_asset_path,b.source_end_ms-b.source_start_ms duration_ms FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id JOIN shot_utterance_bindings b ON b.shot_id=sh.id WHERE ga.id=? AND sc.project_id=? AND ga.operation='lip_sync'`).get(attemptId,projectId) as {id:string;shot_id:string;status:string;result_asset_path:string|null;duration_ms:number}|undefined;
  if (!attempt || !attempt.result_asset_path) throw new Error("Lip-sync candidate is not retained in this project.");
  const covered=db.prepare("SELECT id FROM coverage_beats WHERE shot_id=? LIMIT 1").get(attempt.shot_id);
  if (covered) throw new Error("Covered lip-sync must be accepted for its exact coverage beat, not the whole shot.");
  const existing=db.prepare("SELECT id FROM clips WHERE generation_attempt_id=?").get(attemptId) as {id:string}|undefined;
  if (existing) return {clipId:existing.id,reused:true};
  if (attempt.status !== "hold_for_review" && attempt.status !== "accepted") throw new Error("Only a held lip-sync candidate can be accepted.");
  const clipId=randomUUID(), now=Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    validateAttemptRevision(db,getDataDir(),projectId,attemptId);
    db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=? AND status='hold_for_review'").run(attemptId);
    db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,?,?)").run(clipId,attempt.shot_id,attemptId,attempt.duration_ms,now);
    const reviewNoteId=randomUUID();
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'human',?,1,?)").run(reviewNoteId,projectId,attempt.shot_id,`Producer accepted lip-sync candidate ${attemptId}.`,now);
    recordMediaAcceptance(db,projectId,attemptId,reviewNoteId);
    db.exec("COMMIT");
  } catch(error) { db.exec("ROLLBACK"); throw error; }
  return {clipId,reused:false};
}

/** Producer selection for one speaking coverage beat, in shot-local time. */
export function acceptCoveredLipSyncCandidate(db: DatabaseSync, projectId: string, attemptId: string, beatId: string): { clipId:string; reused:boolean } {
  const row=db.prepare(`SELECT ga.id,ga.shot_id,ga.status AS attempt_status,ga.result_asset_path,
      cb.audio_start_ms,cb.audio_end_ms,cb.status AS beat_status,cb.beat_type,cb.needs_lip_sync,
      ub.source_end_ms-ub.source_start_ms AS utterance_duration_ms
    FROM generation_attempts ga
    JOIN shots sh ON sh.id=ga.shot_id AND sh.needs_lip_sync=1
    JOIN scenes sc ON sc.id=sh.scene_id AND sc.project_id=?
    JOIN coverage_beats cb ON cb.id=? AND cb.shot_id=sh.id
    JOIN shot_utterance_bindings ub ON ub.shot_id=sh.id
    WHERE ga.id=? AND ga.operation='lip_sync'`).get(projectId,beatId,attemptId) as {
      id:string;shot_id:string;attempt_status:string;result_asset_path:string|null;
      audio_start_ms:number;audio_end_ms:number;beat_status:string;beat_type:string;
      needs_lip_sync:number;utterance_duration_ms:number;
    }|undefined;
  if (!row || !row.result_asset_path || row.beat_status!=="accepted" || row.beat_type!=="lip_sync_insert" || row.needs_lip_sync!==1 || row.audio_start_ms<0 || row.audio_end_ms>row.utterance_duration_ms || row.audio_end_ms<=row.audio_start_ms) throw new Error("Candidate and approved speaking coverage beat do not match.");
  const existing=db.prepare("SELECT id,timeline_start_ms,timeline_end_ms FROM clips WHERE generation_attempt_id=?").get(attemptId) as {id:string;timeline_start_ms:number;timeline_end_ms:number}|undefined;
  if (existing) {
    if (existing.timeline_start_ms!==row.audio_start_ms || existing.timeline_end_ms!==row.audio_end_ms) throw new Error("Candidate was selected for a different interval.");
    return {clipId:existing.id,reused:true};
  }
  if (row.attempt_status!=="hold_for_review") throw new Error("Only a held coverage lip-sync candidate can be accepted.");
  const overlap=db.prepare("SELECT id FROM clips WHERE shot_id=? AND timeline_start_ms<? AND timeline_end_ms>? AND generation_attempt_id<>?").get(row.shot_id,row.audio_end_ms,row.audio_start_ms,attemptId);
  if (overlap) throw new Error("A different selected clip already overlaps this coverage beat.");
  const clipId=randomUUID(),now=Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=? AND status='hold_for_review'").run(attemptId);
    db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,?,?,?)").run(clipId,row.shot_id,attemptId,row.audio_start_ms,row.audio_end_ms,now);
    const reviewNoteId=randomUUID();
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'human',?,1,?)").run(reviewNoteId,projectId,row.shot_id,`Producer accepted lip-sync candidate ${attemptId} for coverage beat ${beatId} at ${row.audio_start_ms}-${row.audio_end_ms} ms.`,now);
    recordMediaAcceptance(db,projectId,attemptId,reviewNoteId);
    db.exec("COMMIT");
  } catch(error) { db.exec("ROLLBACK"); throw error; }
  return {clipId,reused:false};
}
