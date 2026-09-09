import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const shotId = "0d43887a-8c20-4271-a6d8-3cafad177558";
// Remove prior assemble_shot rows so we can redo cleanly.
const assembleAttempts = db.prepare(`SELECT id FROM generation_attempts WHERE shot_id = ? AND operation = 'assemble_shot'`).all(shotId) as any[];
for (const a of assembleAttempts) {
  db.prepare(`DELETE FROM clips WHERE generation_attempt_id = ?`).run(a.id);
  db.prepare(`DELETE FROM cost_ledger_entries WHERE generation_attempt_id = ?`).run(a.id);
  db.prepare(`DELETE FROM generation_attempts WHERE id = ?`).run(a.id);
}
