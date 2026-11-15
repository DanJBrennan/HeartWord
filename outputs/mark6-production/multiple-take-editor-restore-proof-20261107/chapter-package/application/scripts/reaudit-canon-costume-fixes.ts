/**
 * Re-runs the garment critic against just the 15 characters promoted in
 * today's Mark 3 costume-fix batches (see
 * docs/handoffs/2026-09-21-codex-canon-costume-fixes.md and
 * docs/plans/CURRENT_GOAL.md), instead of a full-canon pass that would also
 * re-charge and re-review the 17 characters nothing changed for.
 *
 * Writes the same review_notes + cost_ledger_entries rows a full audit
 * would, via auditCanonGarments's new optional character-name filter.
 *
 * Run: npx tsx scripts/reaudit-canon-costume-fixes.ts
 */
import "dotenv/config";
import { auditCanonGarments } from "../src/pipeline/qc/canon-critic.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267"; // Mark 3, hatam

const PROMOTED_CHARACTERS = [
  "Jesus",
  "Crowd witness (stern man, spokesperson)",
  "Principal scribe",
  "Peter",
  "John son of Zebedee",
  "Crowd witness (young man)",
  "Man with Withered Hand",
  "Matthew (Levi)",
  "Scribe (younger, lean)",
  "Crowd witness (man, headwrap)",
  "Scribe (older, stout)",
  "Bartholomew",
  "James son of Alphaeus",
  "Judas Iscariot",
  "Philip the Apostle"
];

async function main() {
  const results = await auditCanonGarments(PROJECT_ID, PROMOTED_CHARACTERS);
  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
  const bySeverity = new Map<string, string[]>();
  for (const r of results) {
    bySeverity.set(r.severity, [...(bySeverity.get(r.severity) ?? []), r.characterName]);
  }
  console.log(`Re-audited ${results.length}/${PROMOTED_CHARACTERS.length} characters, $${totalCost.toFixed(4)} total.\n`);
  for (const [severity, names] of bySeverity) {
    console.log(`${severity} (${names.length}): ${names.join(", ")}`);
  }
  const missing = PROMOTED_CHARACTERS.filter((n) => !results.some((r) => r.characterName === n));
  if (missing.length) console.log(`\nNo result (missing readable asset?): ${missing.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
