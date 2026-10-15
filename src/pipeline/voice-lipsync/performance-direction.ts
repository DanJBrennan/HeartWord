/** Same append-only production history for manual controls and autonomous stage 5. */
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { validateAvatarDirection, type AvatarDirection } from "../../providers/kling/avatar-direction.js";

function scope(db: DatabaseSync, projectId: string, shotIds: string[]) {
  return shotIds.map(shotId => {
    const row = db.prepare(`SELECT s.id,s.dialogue_character_id,b.* FROM shots s JOIN scenes sc ON sc.id=s.scene_id
      JOIN shot_utterance_bindings b ON b.shot_id=s.id WHERE s.id=? AND sc.project_id=? AND s.needs_lip_sync=1`).get(shotId,projectId);
    if (!row) throw new Error(`Speaking shot ${shotId} needs an existing exact approved utterance binding.`);
    return row;
  });
}
const digest = (value:unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function savePerformanceDirection(db:DatabaseSync, input:{projectId:string;shotIds:string[];direction:AvatarDirection;actor:string;idempotencyKey:string}) {
  validateAvatarDirection(input.direction);
  if (!Array.isArray(input.shotIds) || !input.shotIds.length || input.shotIds.some(id=>typeof id!=="string" || !id) || new Set(input.shotIds).size!==input.shotIds.length || !input.actor?.trim() || !input.idempotencyKey?.trim()) throw new Error("Provide distinct shot IDs, an accountable owner and an idempotency key.");
  const prior = db.prepare("SELECT project_id,payload FROM edit_commands WHERE idempotency_key=?").get(input.idempotencyKey);
  const request = {shotIds:input.shotIds,direction:input.direction,actor:input.actor};
  if (prior) {
    const saved = JSON.parse(String(prior.payload));
    if (prior.project_id!==input.projectId || digest(saved.request)!==digest(request)) throw new Error("Idempotency key belongs to a different performance decision.");
    return saved;
  }
  const packet = {id:randomUUID(),request,bindings:scope(db,input.projectId,input.shotIds)};
  db.prepare(`INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at)
    SELECT ?,?,COALESCE(MAX(sequence),0)+1,'set_avatar_performance',?,?,? FROM edit_commands WHERE project_id=?`)
    .run(packet.id,input.projectId,JSON.stringify(packet),input.idempotencyKey,Date.now(),input.projectId);
  return packet;
}
export function readPerformanceDirection(db:DatabaseSync,projectId:string,shotId:string):AvatarDirection|undefined {
  const rows = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='set_avatar_performance' AND undone=0 ORDER BY sequence DESC").all(projectId);
  for (const row of rows) {
    const saved = JSON.parse(String(row.payload)) as {request:{shotIds:string[];direction:AvatarDirection};bindings:unknown[]};
    if (!saved.request.shotIds.includes(shotId)) continue;
    validateAvatarDirection(saved.request.direction);
    // A whole group changes together. A generation boundary must not reset
    // direction, and a changed source/voice binding needs explicit reconciliation.
    if (digest(saved.bindings)!==digest(scope(db,projectId,saved.request.shotIds))) throw new Error("Performance direction is stale after a source/voice binding change; reconcile it without changing accepted takes.");
    return saved.request.direction;
  }
  return undefined;
}

/** Review planning arithmetic only: unknown charges cannot be treated as zero.
 * Counts planning, reviews, rejected/retried generation and outstanding work.
 * This does not grant source/canon authority or reserve a provider transaction. */
export function avatarComparisonBudget(costs:{recordedUsd:number;unreportedUpperBoundUsd:number|null;outstandingUpperBoundUsd:number|null;comparisonUpperBoundUsd:number}) {
  const values=Object.values(costs);
  if (values.some(v=>v===null || !Number.isFinite(v) || v<0)) throw new Error("Reconcile unreported and outstanding production charges before any comparison spending.");
  const committed=costs.recordedUsd+costs.unreportedUpperBoundUsd!+costs.outstandingUpperBoundUsd!;
  if (committed+costs.comparisonUpperBoundUsd>200) throw new Error("Comparison exceeds the cumulative $200 film budget.");
  return {committedUsd:committed,remainingUsd:200-committed,afterComparisonUsd:committed+costs.comparisonUpperBoundUsd};
}

function unknownCostFingerprint(db:DatabaseSync,projectId:string) {
  const events = db.prepare(`SELECT e.id FROM production_events e JOIN production_runs r ON r.id=e.run_id WHERE r.project_id=? AND e.cost_usd IS NULL ORDER BY e.id`).all(projectId);
  const media = db.prepare(`SELECT ga.id FROM generation_attempts ga JOIN shots s ON s.id=ga.shot_id JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=? AND ga.cost_usd IS NULL ORDER BY ga.id`).all(projectId);
  const soundtrack = db.prepare("SELECT id FROM soundtrack_attempts WHERE project_id=? AND cost_usd IS NULL ORDER BY id").all(projectId);
  return digest([...events,...media.map(r=>({id:`media:${r.id}`})),...soundtrack.map(r=>({id:`soundtrack:${r.id}`}))]);
}
function append(db:DatabaseSync,projectId:string,type:string,payload:unknown,key:string) {
  db.prepare(`INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at)
    SELECT ?,?,COALESCE(MAX(sequence),0)+1,?,?,?,? FROM edit_commands WHERE project_id=?`)
    .run(randomUUID(),projectId,type,JSON.stringify(payload),key,Date.now(),projectId);
}
/** Existing cost/production records stay authoritative. A named evidenced upper
 * bound accounts for GUI, historical and otherwise unreported charges; zero
 * must be positively reconciled rather than inferred from an empty ledger. */
export function reconcileAvatarBudget(db:DatabaseSync,input:{projectId:string;actor:string;evidence:string;unreportedUpperBoundUsd:number;outstandingUpperBoundUsd:number;idempotencyKey:string}) {
  if(!input.actor?.trim() || !input.evidence?.trim() || !input.idempotencyKey?.trim() || !db.prepare("SELECT id FROM projects WHERE id=?").get(input.projectId))throw new Error("Budget reconciliation needs a real film, accountable owner and billing evidence.");
  avatarComparisonBudget({recordedUsd:0,unreportedUpperBoundUsd:input.unreportedUpperBoundUsd,outstandingUpperBoundUsd:input.outstandingUpperBoundUsd,comparisonUpperBoundUsd:0});
  const previous=db.prepare("SELECT project_id,payload FROM edit_commands WHERE idempotency_key=?").get(input.idempotencyKey);
  if(previous){if(previous.project_id!==input.projectId || digest(JSON.parse(String(previous.payload)).input)!==digest(input))throw new Error("Budget idempotency key conflict.");return;}
  append(db,input.projectId,"reconcile_avatar_budget",{input,unknownCostFingerprint:unknownCostFingerprint(db,input.projectId)},input.idempotencyKey);
}
export function checkFilmSpend(db:DatabaseSync,projectId:string,upperBoundUsd:number) {
  const latest=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reconcile_avatar_budget' AND undone=0 ORDER BY sequence DESC LIMIT 1").get(projectId);
  if(!latest)throw new Error("Film spending held: reconcile cumulative film costs and outstanding charges first; no per-chapter plan signature is required.");
  const saved=JSON.parse(String(latest.payload));
  if(saved.unknownCostFingerprint!==unknownCostFingerprint(db,projectId))throw new Error("New unreported production costs require budget reconciliation before further spending.");
  const pending=db.prepare(`SELECT payload FROM edit_commands r WHERE project_id=? AND command_type IN ('reserve_avatar_spend','reserve_crew_spend')
    AND NOT EXISTS(SELECT 1 FROM edit_commands s WHERE s.project_id=r.project_id AND s.command_type IN ('settle_avatar_spend','settle_crew_spend') AND json_extract(s.payload,'$.reservationId')=json_extract(r.payload,'$.reservationId'))`).all(projectId);
  const pendingUsd=pending.reduce((sum,r)=>sum+Number(JSON.parse(String(r.payload)).upperBoundUsd),0);
  const ledger=Number(db.prepare("SELECT COALESCE(SUM(amount_usd),0) total FROM cost_ledger_entries WHERE project_id=?").get(projectId)!.total);
  return avatarComparisonBudget({recordedUsd:ledger,unreportedUpperBoundUsd:saved.input.unreportedUpperBoundUsd,outstandingUpperBoundUsd:saved.input.outstandingUpperBoundUsd+pendingUsd,comparisonUpperBoundUsd:upperBoundUsd});
}
/** Historical API name retained for existing stage-5 and producer callers. */
export const checkAvatarSpend = checkFilmSpend;
export function reserveAvatarSpend(db:DatabaseSync,projectId:string,shotId:string,upperBoundUsd:number) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const prior=db.prepare(`SELECT r.id FROM edit_commands r WHERE r.project_id=? AND r.command_type='reserve_avatar_spend' AND json_extract(r.payload,'$.shotId')=?
      AND NOT EXISTS(SELECT 1 FROM edit_commands s WHERE s.project_id=r.project_id AND s.command_type='settle_avatar_spend' AND json_extract(s.payload,'$.reservationId')=json_extract(r.payload,'$.reservationId'))`).get(projectId,shotId);
    if(prior)throw new Error("An Avatar request for this shot is still outstanding; query its existing task and reconcile before retrying.");
    checkAvatarSpend(db,projectId,upperBoundUsd);
    const reservationId=randomUUID();append(db,projectId,"reserve_avatar_spend",{reservationId,shotId,upperBoundUsd},`avatar-reservation:${reservationId}`);
    db.exec("COMMIT");return reservationId;
  }catch(error){db.exec("ROLLBACK");throw error;}
}
/** Only after the immutable terminal attempt + ledger entry exist. */
export function settleAvatarSpend(db:DatabaseSync,projectId:string,reservationId:string,attemptId:string) {
  const reservation=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reserve_avatar_spend' AND json_extract(payload,'$.reservationId')=?").get(projectId,reservationId);
  const attempt=db.prepare("SELECT ga.shot_id FROM generation_attempts ga JOIN shots s ON s.id=ga.shot_id JOIN scenes sc ON sc.id=s.scene_id WHERE ga.id=? AND sc.project_id=?").get(attemptId,projectId);
  if(!reservation || !attempt || attempt.shot_id!==JSON.parse(String(reservation.payload)).shotId || !db.prepare("SELECT id FROM cost_ledger_entries WHERE project_id=? AND generation_attempt_id=?").get(projectId,attemptId))throw new Error("Record the matching terminal attempt and ledger charge before settling its reservation.");
  append(db,projectId,"settle_avatar_spend",{reservationId,attemptId},`avatar-settled:${reservationId}`);
}
