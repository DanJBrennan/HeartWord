import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

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
