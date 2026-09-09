import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const shotId = "0d43887a-8c20-4271-a6d8-3cafad177558";
const redoBeats = ["a70da82f-890f-46fc-87ad-73ae6aa3a303", "8d05821d-d696-4844-8d72-d7f4ea1a11a4", "9ec6bde6-2304-4d72-9b0c-62c1d5b3a2bd"];

// Delete clips + generation_attempts for beats 1, 2, 4 (redo targets),
// matched by timeline range since clips don't reference coverage_beats directly.
const beatRanges = db.prepare(`SELECT id, audio_start_ms, audio_end_ms FROM coverage_beats WHERE id IN (${redoBeats.map(()=>'?').join(',')})`).all(...redoBeats) as any[];
for (const b of beatRanges) {
  const attempt = db.prepare(`SELECT ga.id FROM clips cl JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id WHERE cl.shot_id = ? AND cl.timeline_start_ms = ? AND cl.timeline_end_ms = ? AND ga.operation != 'assemble_shot'`).get(shotId, b.audio_start_ms, b.audio_end_ms) as any;
  if (attempt) {
    db.prepare(`DELETE FROM clips WHERE generation_attempt_id = ?`).run(attempt.id);
    db.prepare(`DELETE FROM cost_ledger_entries WHERE generation_attempt_id = ?`).run(attempt.id);
    db.prepare(`DELETE FROM generation_attempts WHERE id = ?`).run(attempt.id);
    console.log(`Deleted attempt+clip for beat ${b.id}`);
  }
}

// Delete any prior assemble_shot rows for this shot.
const assembleAttempts = db.prepare(`SELECT id FROM generation_attempts WHERE shot_id = ? AND operation = 'assemble_shot'`).all(shotId) as any[];
for (const a of assembleAttempts) {
  db.prepare(`DELETE FROM clips WHERE generation_attempt_id = ?`).run(a.id);
  db.prepare(`DELETE FROM cost_ledger_entries WHERE generation_attempt_id = ?`).run(a.id);
  db.prepare(`DELETE FROM generation_attempts WHERE id = ?`).run(a.id);
  console.log(`Deleted old assembled clip ${a.id}`);
}
