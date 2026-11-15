import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { checkFilmSpend } from "../voice-lipsync/performance-direction.js";

/** Extend the existing reconciled film ceiling/reservations to crew calls.
 * A configured conservative call bound is required; this is not a price claim.
 * Unknown/lost charges keep their reservation and require reconciliation. */
export function reserveCrewModelSpend(db: DatabaseSync, projectId: string, eventId: string): string {
  const upperBoundUsd = Number(process.env.HEARTWORD_CREW_CALL_UPPER_BOUND_USD);
  if (!Number.isFinite(upperBoundUsd) || upperBoundUsd <= 0) throw new Error("Crew spending held: configure an evidenced HEARTWORD_CREW_CALL_UPPER_BOUND_USD before paid review calls.");
  db.exec("BEGIN IMMEDIATE");
  try {
    checkFilmSpend(db, projectId, upperBoundUsd);
    const reservationId = randomUUID();
    db.prepare(`INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at)
      SELECT ?,?,COALESCE(MAX(sequence),0)+1,'reserve_crew_spend',?,?,? FROM edit_commands WHERE project_id=?`)
      .run(randomUUID(), projectId, JSON.stringify({reservationId,eventId,upperBoundUsd}), `crew-reservation:${eventId}`, Date.now(), projectId);
    db.exec("COMMIT"); return reservationId;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function settleCrewModelSpend(db: DatabaseSync, projectId: string, reservationId: string, eventId: string, costUsd: number | null) {
  if (costUsd === null) return;
  const reservation = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reserve_crew_spend' AND json_extract(payload,'$.reservationId')=?").get(projectId,reservationId);
  const event = db.prepare("SELECT cost_usd FROM production_events WHERE id=?").get(eventId);
  if (!reservation || JSON.parse(String(reservation.payload)).eventId !== eventId || event?.cost_usd !== costUsd) throw new Error("Crew charge must be retained against its exact reservation/event before settlement.");
  db.prepare(`INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at)
    SELECT ?,?,COALESCE(MAX(sequence),0)+1,'settle_crew_spend',?,?,? FROM edit_commands WHERE project_id=?`)
    .run(randomUUID(),projectId,JSON.stringify({reservationId,eventId,costUsd}),`crew-settled:${eventId}`,Date.now(),projectId);
}

/**
 * Records one reasoning call's estimated cost against the project, so
 * CrewBrief.spentUsd reflects it like any other spend. generation_attempt_id
 * is null because this is a text/JSON reasoning call, not a media
 * generation attempt -- the same shape crew-store.ts already writes for
 * the production crew's own calls.
 *
 * A zero cost (a response with no usageMetadata, or a stubbed call in a
 * test) writes nothing rather than a meaningless row.
 */
export function recordModelSpend(db: DatabaseSync, projectId: string, costUsd: number): void {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  db.prepare(
    "INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, NULL, ?, ?)"
  ).run(randomUUID(), projectId, costUsd, Date.now());
}
