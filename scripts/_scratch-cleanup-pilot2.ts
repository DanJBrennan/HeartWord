import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const shotId = "0d43887a-8c20-4271-a6d8-3cafad177558";
// Beats 2 (3500-9260) and 4 (12260-18019) by timeline range.
const ranges = [[3500,9260],[12260,18019]];
for (const [s,e] of ranges) {
  const attempt = db.prepare(`SELECT ga.id FROM clips cl JOIN generation_attempts ga ON ga.id=cl.generation_attempt_id WHERE cl.shot_id=? AND cl.timeline_start_ms=? AND cl.timeline_end_ms=? AND ga.operation != 'assemble_shot'`).get(shotId, s, e) as any;
  if (attempt) {
    db.prepare(`DELETE FROM clips WHERE generation_attempt_id=?`).run(attempt.id);
    db.prepare(`DELETE FROM cost_ledger_entries WHERE generation_attempt_id=?`).run(attempt.id);
    db.prepare(`DELETE FROM generation_attempts WHERE id=?`).run(attempt.id);
    console.log(`Deleted attempt ${attempt.id} for range ${s}-${e}`);
  }
}
const assembleAttempts = db.prepare(`SELECT id FROM generation_attempts WHERE shot_id=? AND operation='assemble_shot'`).all(shotId) as any[];
for (const a of assembleAttempts) {
  db.prepare(`DELETE FROM clips WHERE generation_attempt_id=?`).run(a.id);
  db.prepare(`DELETE FROM cost_ledger_entries WHERE generation_attempt_id=?`).run(a.id);
  db.prepare(`DELETE FROM generation_attempts WHERE id=?`).run(a.id);
}
