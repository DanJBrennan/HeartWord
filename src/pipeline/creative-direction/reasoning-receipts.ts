import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

/** Reuse append-only edit history; these are provider receipts, never creative
 * directions, acceptance, or a second production state. */
export function appendReasoningReceipt(db: DatabaseSync, projectId: string, eventId: string,
  kind: "submit_crew_reasoning" | "complete_crew_reasoning", evidence: Record<string, unknown>) {
  db.prepare(`INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at)
    SELECT ?,?,COALESCE(MAX(sequence),0)+1,?,?,?,? FROM edit_commands WHERE project_id=?`)
    .run(randomUUID(), projectId, kind, JSON.stringify({ eventId, ...evidence }), `${kind}:${eventId}`, Date.now(), projectId);
}

export function assertNoUncertainReasoning(db: DatabaseSync, projectId: string) {
  const pending = db.prepare(`SELECT json_extract(s.payload,'$.eventId') AS eventId FROM edit_commands s
    WHERE s.project_id=? AND s.command_type='submit_crew_reasoning' AND NOT EXISTS (
      SELECT 1 FROM edit_commands c WHERE c.project_id=s.project_id AND c.command_type='complete_crew_reasoning'
      AND json_extract(c.payload,'$.eventId')=json_extract(s.payload,'$.eventId')) LIMIT 1`).get(projectId);
  if (pending) throw new Error(`Crew reasoning held: reconcile submitted event ${pending.eventId} before another model request. No uncertain request is automatically repeated.`);
}
