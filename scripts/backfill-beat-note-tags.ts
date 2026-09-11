/**
 * One-time backfill for review_notes rows written by
 * runCoverageBeatCandidateReview BEFORE it started tagging its own notes
 * "BEAT: <beat_id>" (commit 23f3d05, 2026-09-11) -- those legacy rows are
 * untagged, so matchesBeatScope's "no tag = shot-wide" rule makes them
 * incorrectly apply to every beat of their shot, not just the one they
 * were actually about. Confirmed by Codex's second review (2026-09-11):
 * "I reproduced a legacy correction being selected for another beat."
 *
 * The beat is recoverable: every such note's text still literally
 * contains "Coverage-beat candidate <attemptId> composite QC", and
 * coverage_keyframe_attempts.coverage_beat_id maps that attemptId
 * straight back to its real beat. Idempotent -- only touches rows that
 * still lack a leading BEAT/ATTEMPT tag.
 *
 * Run: npx tsx scripts/backfill-beat-note-tags.ts
 */
import "dotenv/config";
import { getDb } from "../src/db/client.js";

const db = getDb();

const CANDIDATE_LINE = /^Coverage-beat candidate ([0-9a-f-]{36}) composite QC/;
const ALREADY_TAGGED = /^(BEAT|ATTEMPT):\s*\S+/;

const rows = db
  .prepare(`SELECT id, note FROM review_notes WHERE subject_type = 'shot' AND source = 'qc'`)
  .all() as Array<{ id: string; note: string }>;

const findBeatId = db.prepare(`SELECT coverage_beat_id FROM coverage_keyframe_attempts WHERE id = ?`);
const updateNote = db.prepare(`UPDATE review_notes SET note = ? WHERE id = ?`);

let tagged = 0;
let skippedAlreadyTagged = 0;
let skippedNoMatch = 0;
let skippedUnknownAttempt = 0;

for (const row of rows) {
  if (ALREADY_TAGGED.test(row.note)) {
    skippedAlreadyTagged++;
    continue;
  }
  const match = row.note.match(CANDIDATE_LINE);
  if (!match) {
    skippedNoMatch++;
    continue;
  }
  const attemptId = match[1]!;
  const beat = findBeatId.get(attemptId) as { coverage_beat_id: string } | undefined;
  if (!beat) {
    skippedUnknownAttempt++;
    console.log(`  ? note ${row.id}: candidate attempt ${attemptId} not found in coverage_keyframe_attempts -- left untagged`);
    continue;
  }
  updateNote.run(`BEAT: ${beat.coverage_beat_id}\n${row.note}`, row.id);
  tagged++;
  console.log(`  tagged note ${row.id} -> BEAT: ${beat.coverage_beat_id}`);
}

console.log(
  `\nDone: ${tagged} note(s) tagged, ${skippedAlreadyTagged} already tagged, ${skippedNoMatch} not a coverage-beat note, ` +
    `${skippedUnknownAttempt} referenced an unknown attempt.`
);
